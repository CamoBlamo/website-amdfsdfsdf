import { prisma } from '../lib/db.js';
import { getUserFromRequest, isEmailAdmin } from '../lib/auth-utils.js';
import { applySecurityHeaders, verifySameOriginRequest, enforceRateLimit } from '../lib/api-security.js';
import { getUserDepartments, hasDepartment } from '../lib/department-access.js';

const EMPLOYEE_ROLES = ['staff', 'moderator', 'administrator', 'co-owner', 'owner'];
const ELEVATED_EMPLOYEE_ROLES = ['moderator', 'administrator', 'co-owner', 'owner'];
const TICKET_STATUSES = ['pending', 'in-progress', 'resolved', 'dismissed'];
const CHAT_AUTHOR_TYPES = ['customer', 'employee', 'system', 'internal'];
const TICKET_DEPARTMENTS = ['Support', 'Billing', 'Engineering', 'Product', 'Sales'];
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES_PER_TICKET = 150;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_PREFIXES = ['image/', 'application/pdf', 'text/plain'];
const AVG_QUEUE_MINUTES_PER_TICKET = 3;
const CATEGORY_PRIORITY = {
  incident: 0,
  bug: 1,
  billing: 2,
  access: 3,
  task: 4,
  other: 5,
};

function normalizeRole(role) {
  const value = String(role || 'user').toLowerCase().trim();
  if (value === 'admin') return 'administrator';
  if (value === 'coowner') return 'co-owner';
  return value;
}

function isEmployeeRole(role) {
  return EMPLOYEE_ROLES.includes(normalizeRole(role));
}

function canUseSupportDesk(role, departments) {
  const normalizedRole = normalizeRole(role);
  if (ELEVATED_EMPLOYEE_ROLES.includes(normalizedRole)) {
    return true;
  }

  return hasDepartment(departments, 'customer-support');
}

function normalizeStatus(value) {
  const normalized = String(value || 'pending').toLowerCase().trim();
  return TICKET_STATUSES.includes(normalized) ? normalized : 'pending';
}

function normalizeCategory(value) {
  const normalized = String(value || 'other').toLowerCase().trim();
  return normalized || 'other';
}

function normalizeDepartment(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Support';

  const matched = TICKET_DEPARTMENTS.find((item) => item.toLowerCase() === normalized.toLowerCase());
  return matched || 'Support';
}

function inferDepartmentFromReason(reason) {
  const value = String(reason || '').toLowerCase();
  if (value.includes('[billing]')) return 'Billing';
  if (value.includes('[bug]') || value.includes('[incident]')) return 'Engineering';
  if (value.includes('[task]')) return 'Product';
  if (value.includes('[access]')) return 'Support';
  return 'Support';
}

function extractCategoryFromReason(reason) {
  const value = String(reason || '').trim();
  const match = value.match(/^\[([^\]]+)\]/);
  if (!match || !match[1]) return 'other';
  return normalizeCategory(match[1]);
}

function normalizeChatAuthorType(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (CHAT_AUTHOR_TYPES.includes(normalized)) {
    return normalized;
  }
  return 'customer';
}

function normalizeMessageText(value) {
  return String(value || '').trim().slice(0, MAX_MESSAGE_LENGTH);
}

function isAllowedAttachmentType(mimeType) {
  const normalized = String(mimeType || '').toLowerCase().trim();
  if (!normalized) return false;

  return ALLOWED_ATTACHMENT_MIME_PREFIXES.some((value) => {
    if (value.endsWith('/')) {
      return normalized.startsWith(value);
    }
    return normalized === value;
  });
}

function normalizeAttachment(input) {
  if (!input || typeof input !== 'object') return null;

  const name = String(input.name || '').trim().slice(0, 120);
  const mimeType = String(input.type || '').toLowerCase().trim().slice(0, 80);
  const dataUrl = String(input.dataUrl || '').trim();

  if (!name || !mimeType || !dataUrl || !isAllowedAttachmentType(mimeType)) {
    return null;
  }

  const dataUrlMatch = dataUrl.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if (!dataUrlMatch) {
    return null;
  }

  const headerMimeType = String(dataUrlMatch[1] || '').toLowerCase();
  const base64Body = dataUrlMatch[2] || '';
  const byteLength = Math.floor((base64Body.length * 3) / 4);

  if (headerMimeType !== mimeType) {
    return null;
  }

  if (byteLength <= 0 || byteLength > MAX_ATTACHMENT_BYTES) {
    return null;
  }

  return {
    name,
    type: mimeType,
    dataUrl,
    size: byteLength,
  };
}

function formatTimestamp(value, fallback = new Date()) {
  const parsed = new Date(value || fallback);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(fallback).toISOString();
  }
  return parsed.toISOString();
}

function createMessageId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function legacyMessageFromReport(report) {
  const text = normalizeMessageText(report.description || '');
  if (!text) return null;

  const fallbackAuthor = report.reporter?.name || report.reporter?.username || report.reporter?.email || 'Customer';
  return {
    id: createMessageId(),
    authorType: 'customer',
    authorId: report.reporterId,
    authorName: fallbackAuthor,
    text,
    createdAt: formatTimestamp(report.createdAt),
  };
}

function normalizeChatMessage(input, index = 0) {
  if (!input || typeof input !== 'object') return null;

  const text = normalizeMessageText(input.text || input.message);
  const attachment = normalizeAttachment(input.attachment || input.file);
  if (!text && !attachment) return null;

  return {
    id: String(input.id || `${createMessageId()}_${index}`),
    authorType: normalizeChatAuthorType(input.authorType),
    authorId: input.authorId ? String(input.authorId) : '',
    authorName: String(input.authorName || 'User').slice(0, 80),
    text,
    attachment,
    createdAt: formatTimestamp(input.createdAt),
  };
}

function normalizeThreadMeta(input) {
  if (!input || typeof input !== 'object') {
    return { department: 'Support' };
  }

  const claimedById = input.claimedById ? String(input.claimedById) : '';
  const claimedByName = input.claimedByName ? String(input.claimedByName).slice(0, 80) : '';
  const claimedAtValue = input.claimedAt ? new Date(input.claimedAt) : null;
  const claimedAt = claimedAtValue && !Number.isNaN(claimedAtValue.getTime())
    ? claimedAtValue.toISOString()
    : '';

  const department = normalizeDepartment(input.department);
  const transferredById = input.transferredById ? String(input.transferredById) : '';
  const transferredByName = input.transferredByName ? String(input.transferredByName).slice(0, 80) : '';
  const transferredAtValue = input.transferredAt ? new Date(input.transferredAt) : null;
  const transferredAt = transferredAtValue && !Number.isNaN(transferredAtValue.getTime())
    ? transferredAtValue.toISOString()
    : '';

  const result = {
    department,
    claimedById,
    claimedByName: claimedByName || 'Employee',
    claimedAt,
    transferredById,
    transferredByName,
    transferredAt,
  };

  if (!claimedById && !claimedByName) {
    delete result.claimedById;
    delete result.claimedByName;
    delete result.claimedAt;
  }

  if (!transferredById && !transferredByName) {
    delete result.transferredById;
    delete result.transferredByName;
    delete result.transferredAt;
  }

  return result;
}

function claimThreadByUser(thread, user) {
  const next = {
    ...thread,
    messages: Array.isArray(thread.messages) ? [...thread.messages] : [],
    meta: normalizeThreadMeta(thread.meta),
  };

  next.meta.claimedById = user.id;
  next.meta.claimedByName = user.name || user.username || user.email || 'Employee';
  next.meta.claimedAt = new Date().toISOString();
  next.meta.department = normalizeDepartment(next.meta.department);

  return next;
}

function withAgentJoinSystemMessage(thread, previousThread, user) {
  const previousMeta = normalizeThreadMeta(previousThread && previousThread.meta);
  const previousClaimedById = String(previousMeta.claimedById || '').trim();
  if (previousClaimedById === user.id) {
    return thread;
  }

  const agentName = user.name || user.username || user.email || 'Support Agent';
  const text = previousClaimedById
    ? `${agentName} is now handling your chat.`
    : `${agentName} joined your chat.`;

  return appendThreadMessage(thread, {
    authorType: 'system',
    authorId: user.id,
    authorName: 'System',
    text,
  });
}

function transferThreadDepartment(thread, user, nextDepartment) {
  const next = {
    ...thread,
    messages: Array.isArray(thread.messages) ? [...thread.messages] : [],
    meta: normalizeThreadMeta(thread.meta),
  };

  next.meta.department = normalizeDepartment(nextDepartment);
  next.meta.transferredById = user.id;
  next.meta.transferredByName = user.name || user.username || user.email || 'Employee';
  next.meta.transferredAt = new Date().toISOString();

  return next;
}

function parseThreadFromReport(report) {
  const raw = String(report.description || '').trim();
  if (!raw) {
    return { version: 1, messages: [], meta: {} };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.messages)) {
      const messages = parsed.messages
        .map((message, index) => normalizeChatMessage(message, index))
        .filter(Boolean)
        .slice(-MAX_MESSAGES_PER_TICKET);

      return {
        version: 1,
        messages,
        meta: normalizeThreadMeta(parsed.meta),
      };
    }
  } catch (error) {
    // Legacy non-JSON ticket descriptions are treated as the first message.
  }

  const fallback = legacyMessageFromReport(report);
  return {
    version: 1,
    messages: fallback ? [fallback] : [],
    meta: {},
  };
}

function serializeThread(thread) {
  const safeMessages = Array.isArray(thread.messages)
    ? thread.messages.slice(-MAX_MESSAGES_PER_TICKET)
    : [];
  const safeMeta = normalizeThreadMeta(thread.meta);

  return JSON.stringify({
    version: 1,
    messages: safeMessages,
    meta: safeMeta,
  });
}

function appendThreadMessage(thread, message) {
  const text = normalizeMessageText(message && message.text);
  const attachment = normalizeAttachment(message && message.attachment);
  if (!text && !attachment) {
    return thread;
  }

  const next = {
    ...thread,
    messages: Array.isArray(thread.messages) ? [...thread.messages] : [],
    meta: normalizeThreadMeta(thread.meta),
  };

  next.messages.push({
    id: createMessageId(),
    authorType: normalizeChatAuthorType(message.authorType),
    authorId: message.authorId ? String(message.authorId) : '',
    authorName: String(message.authorName || 'User').slice(0, 80),
    text,
    attachment,
    createdAt: formatTimestamp(new Date()),
  });

  if (next.messages.length > MAX_MESSAGES_PER_TICKET) {
    next.messages = next.messages.slice(-MAX_MESSAGES_PER_TICKET);
  }

  return next;
}

function getLastMessage(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  return messages[messages.length - 1];
}

function filterMessagesByAudience(messages, includeInternal) {
  if (!Array.isArray(messages)) return [];
  if (includeInternal) return messages;

  return messages.filter((message) => {
    const authorType = String(message && message.authorType ? message.authorType : '').toLowerCase();
    return authorType !== 'internal';
  });
}

function sortByActivityDesc(tickets) {
  return [...tickets].sort((a, b) => {
    const aTime = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function isClosedStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === 'resolved' || normalized === 'dismissed';
}

function isClaimedTicket(ticket) {
  return Boolean(String(ticket && ticket.claimedById ? ticket.claimedById : '').trim());
}

function buildSupportQueue(tickets) {
  return [...tickets]
    .filter((ticket) => normalizeStatus(ticket.status) === 'pending' && !isClaimedTicket(ticket))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function buildDepartmentQueues(tickets) {
  const map = {};
  for (const department of TICKET_DEPARTMENTS) {
    map[department] = [];
  }

  for (const ticket of tickets) {
    const department = normalizeDepartment(ticket.department || inferDepartmentFromReason(ticket.reason));
    map[department].push(ticket);
  }

  for (const department of Object.keys(map)) {
    map[department] = buildSupportQueue(map[department]);
  }

  return map;
}

function getTicketPriority(ticket) {
  const category = extractCategoryFromReason(ticket.reason);
  const base = Object.prototype.hasOwnProperty.call(CATEGORY_PRIORITY, category)
    ? CATEGORY_PRIORITY[category]
    : CATEGORY_PRIORITY.other;
  const waitMinutes = Math.max(0, Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000));
  const waitBoost = Math.min(3, Math.floor(waitMinutes / 20));
  const score = Math.max(0, base - waitBoost);

  let label = 'Low';
  if (score <= 0) label = 'Critical';
  else if (score === 1) label = 'High';
  else if (score === 2) label = 'Medium';

  return { score, label, category };
}

function withQueueMetadata(tickets, departmentQueues) {
  const totalQueueSize = Object.values(departmentQueues).reduce((sum, queue) => sum + queue.length, 0);

  return tickets.map((ticket) => {
    const department = normalizeDepartment(ticket.department || inferDepartmentFromReason(ticket.reason));
    const queue = departmentQueues[department] || [];
    const queueIds = queue.map((item) => item.id);
    const queueIndex = queueIds.indexOf(ticket.id);
    const inQueue = queueIndex >= 0;
    const status = normalizeStatus(ticket.status);
    const priority = getTicketPriority(ticket);

    let queueState = 'none';
    if (inQueue) {
      queueState = 'waiting';
    } else if (!isClosedStatus(status) && isClaimedTicket(ticket)) {
      queueState = 'active';
    } else if (isClosedStatus(status)) {
      queueState = 'closed';
    }

    const queuePosition = inQueue ? queueIndex + 1 : null;
    const queueAhead = inQueue ? queueIndex : 0;
    const estimatedWaitMinutes = inQueue ? Math.max(1, queueAhead * AVG_QUEUE_MINUTES_PER_TICKET) : 0;

    return {
      ...ticket,
      queueState,
      queuePosition,
      queueAhead,
      estimatedWaitMinutes,
      queueSize: totalQueueSize,
      departmentQueueSize: queue.length,
      priorityScore: priority.score,
      priorityLabel: priority.label,
      category: priority.category,
    };
  });
}

function sortEmployeeQueue(tickets) {
  return [...tickets].sort((a, b) => {
    const aStatus = normalizeStatus(a.status);
    const bStatus = normalizeStatus(b.status);

    const aRank = aStatus === 'pending' && !isClaimedTicket(a)
      ? 0
      : (aStatus === 'pending' ? 1 : (aStatus === 'in-progress' ? 2 : 3));
    const bRank = bStatus === 'pending' && !isClaimedTicket(b)
      ? 0
      : (bStatus === 'pending' ? 1 : (bStatus === 'in-progress' ? 2 : 3));

    if (aRank !== bRank) return aRank - bRank;

    if (aRank === 0 || aRank === 1) {
      const aPriority = Number(a.priorityScore || 0);
      const bPriority = Number(b.priorityScore || 0);
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }

    return new Date(b.lastMessageAt || b.createdAt || 0).getTime() - new Date(a.lastMessageAt || a.createdAt || 0).getTime();
  });
}

async function resolveTicketWorkspaceId(user) {
  if (!user || !user.id) return '';

  const ownedWorkspace = await prisma.workspace.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (ownedWorkspace && ownedWorkspace.id) {
    return ownedWorkspace.id;
  }

  const anyWorkspace = await prisma.workspace.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  return anyWorkspace && anyWorkspace.id ? anyWorkspace.id : '';
}

function formatTicket(report, options = {}) {
  const includeInternal = options && options.includeInternal !== false;
  const thread = parseThreadFromReport(report);
  const visibleMessages = filterMessagesByAudience(thread.messages, includeInternal);
  const lastMessage = getLastMessage(visibleMessages);
  const claimMeta = normalizeThreadMeta(thread.meta);
  const department = normalizeDepartment(claimMeta.department || inferDepartmentFromReason(report.reason));

  return {
    id: report.id,
    reporterId: report.reporterId,
    reporterName: report.reporter?.name || report.reporter?.username || report.reporter?.email || 'Unknown',
    reporterEmail: report.reporter?.email || '',
    reason: report.reason,
    description: lastMessage ? lastMessage.text : '',
    messages: visibleMessages,
    status: normalizeStatus(report.status),
    createdAt: report.createdAt,
    lastMessageAt: lastMessage ? lastMessage.createdAt : formatTimestamp(report.createdAt),
    claimedById: claimMeta.claimedById || '',
    claimedByName: claimMeta.claimedByName || '',
    claimedAt: claimMeta.claimedAt || '',
    department,
    transferredById: claimMeta.transferredById || '',
    transferredByName: claimMeta.transferredByName || '',
    transferredAt: claimMeta.transferredAt || '',
  };
}

async function requireUser(req, res) {
  const tokenUser = getUserFromRequest(req);
  if (!tokenUser) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: tokenUser.id } });
  if (!user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return null;
  }

  return user;
}

async function handleCustomer(req, res, user) {
  if (req.method === 'GET') {
    const reports = await prisma.report.findMany({
      where: { reporterId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { reporter: true },
    });

    const queueReports = await prisma.report.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { reporter: true },
    });

    const formattedTickets = reports.map((report) => formatTicket(report, { includeInternal: false }));
    const allQueueTickets = queueReports.map(formatTicket);
    const queue = buildSupportQueue(allQueueTickets);
    const departmentQueues = buildDepartmentQueues(allQueueTickets);
    const queueAwareTickets = withQueueMetadata(formattedTickets, departmentQueues);

    const byDepartment = {};
    for (const department of TICKET_DEPARTMENTS) {
      byDepartment[department] = (departmentQueues[department] || []).length;
    }

    return res.status(200).json({
      success: true,
      tickets: sortByActivityDesc(queueAwareTickets),
      queue: {
        size: queue.length,
        averageWaitMinutes: AVG_QUEUE_MINUTES_PER_TICKET,
        byDepartment,
      },
    });
  }

  if (req.method !== 'POST') {
    if (req.method !== 'PATCH') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const ticketId = String((req.body && req.body.ticketId) || '').trim();
    const action = String((req.body && req.body.action) || '').toLowerCase().trim();
    const replyText = normalizeMessageText(req.body && req.body.message);
    const replyAttachment = normalizeAttachment(req.body && req.body.attachment);

    if (!ticketId) {
      return res.status(400).json({ success: false, error: 'ticketId is required' });
    }

    const existing = await prisma.report.findUnique({
      where: { id: ticketId },
      include: { reporter: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    if (existing.reporterId !== user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (action !== 'reply' || (!replyText && !replyAttachment)) {
      return res.status(400).json({ success: false, error: 'action=reply and message or attachment is required' });
    }

    const currentThread = parseThreadFromReport(existing);
    const nextThread = appendThreadMessage(currentThread, {
      authorType: 'customer',
      authorId: user.id,
      authorName: user.name || user.username || user.email || 'Customer',
      text: replyText,
      attachment: replyAttachment,
    });

    const nextStatus = ['resolved', 'dismissed'].includes(normalizeStatus(existing.status))
      ? 'pending'
      : normalizeStatus(existing.status);

    const updated = await prisma.report.update({
      where: { id: ticketId },
      data: {
        description: serializeThread(nextThread),
        status: nextStatus,
      },
      include: { reporter: true },
    });

    return res.status(200).json({ success: true, ticket: formatTicket(updated, { includeInternal: false }) });
  }

  const category = normalizeCategory(req.body && req.body.category);
  const subject = String((req.body && req.body.subject) || '').trim();
  const message = String((req.body && req.body.message) || '').trim();
  const attachment = normalizeAttachment(req.body && req.body.attachment);

  if (!subject || (!message && !attachment)) {
    return res.status(400).json({
      success: false,
      error: 'subject and message or attachment are required',
    });
  }

  const fallbackWorkspaceId = await resolveTicketWorkspaceId(user);
  if (!fallbackWorkspaceId) {
    return res.status(400).json({ success: false, error: 'No workspace exists yet to attach tickets.' });
  }

  const reason = `[${category}] ${subject}`.slice(0, 180);
  const thread = appendThreadMessage({ version: 1, messages: [] }, {
    authorType: 'customer',
    authorId: user.id,
    authorName: user.name || user.username || user.email || 'Customer',
    text: message,
    attachment,
  });
  thread.meta = { department: 'Support' };

  const report = await prisma.report.create({
    data: {
      workspaceId: fallbackWorkspaceId,
      reporterId: user.id,
      reason,
      description: serializeThread(thread),
      status: 'pending',
    },
    include: { reporter: true },
  });

  return res.status(201).json({
    success: true,
    ticket: formatTicket(report, { includeInternal: false }),
  });
}

async function handleEmployee(req, res, user, role) {
  if (!isEmployeeRole(role)) {
    return res.status(403).json({ success: false, error: 'Employee access required' });
  }

  const departments = await getUserDepartments(user.id);
  if (!canUseSupportDesk(role, departments)) {
    return res.status(403).json({
      success: false,
      error: 'Customer Support department access required',
      requiredDepartment: 'customer-support',
    });
  }

  if (req.method === 'GET') {
    const scope = String((req.query && req.query.scope) || 'all').toLowerCase();
    const departmentQuery = normalizeDepartment(req.query && req.query.department);
    const hasDepartmentFilter = Boolean(req.query && req.query.department && String(req.query.department).trim());
    const where = scope === 'mine' ? { reporterId: user.id } : {};

    const reports = await prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { reporter: true },
    });

    const formattedTickets = reports.map(formatTicket);
    const departmentQueues = buildDepartmentQueues(formattedTickets);
    const queue = buildSupportQueue(formattedTickets);
    let queueAwareTickets = withQueueMetadata(formattedTickets, departmentQueues);

    if (hasDepartmentFilter) {
      queueAwareTickets = queueAwareTickets.filter((ticket) => normalizeDepartment(ticket.department) === departmentQuery);
    }

    const byDepartment = {};
    for (const department of TICKET_DEPARTMENTS) {
      byDepartment[department] = (departmentQueues[department] || []).length;
    }

    return res.status(200).json({
      success: true,
      tickets: sortEmployeeQueue(queueAwareTickets),
      queue: {
        size: queue.length,
        averageWaitMinutes: AVG_QUEUE_MINUTES_PER_TICKET,
        byDepartment,
      },
    });
  }

  if (req.method === 'POST') {
    const category = String((req.body && req.body.category) || 'other').trim().toLowerCase();
    const subject = String((req.body && req.body.subject) || '').trim();
    const message = String((req.body && req.body.message) || '').trim();

    if (!subject || !message) {
      return res.status(400).json({ success: false, error: 'subject and message are required' });
    }

    const fallbackWorkspaceId = await resolveTicketWorkspaceId(user);
    if (!fallbackWorkspaceId) {
      return res.status(400).json({ success: false, error: 'No workspace exists yet to attach tickets.' });
    }

    const safeCategory = category || 'other';
    const reason = `[${safeCategory}] ${subject}`.slice(0, 180);
    const threadWithMessage = appendThreadMessage({ version: 1, messages: [], meta: {} }, {
      authorType: 'employee',
      authorId: user.id,
      authorName: user.name || user.username || user.email || 'Employee',
      text: message,
    });
    const thread = claimThreadByUser(threadWithMessage, user);
    thread.meta.department = inferDepartmentFromReason(reason);

    const created = await prisma.report.create({
      data: {
        workspaceId: fallbackWorkspaceId,
        reporterId: user.id,
        reason,
        description: serializeThread(thread),
        status: 'pending',
      },
      include: { reporter: true },
    });

    return res.status(201).json({
      success: true,
      ticket: formatTicket(created),
    });
  }

  if (req.method === 'PATCH') {
    const ticketId = String((req.body && req.body.ticketId) || '').trim();
    const action = String((req.body && req.body.action) || '').toLowerCase().trim();
    const nextStatus = normalizeStatus(req.body && req.body.status);
    const replyText = normalizeMessageText(req.body && req.body.message);
    const replyAttachment = normalizeAttachment(req.body && req.body.attachment);

    if (!ticketId) {
      return res.status(400).json({ success: false, error: 'ticketId is required' });
    }

    const existing = await prisma.report.findUnique({
      where: { id: ticketId },
      include: { reporter: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const normalizedRole = normalizeRole(role);
    const canManageAny = isEmployeeRole(normalizedRole);
    const canManageOwn = existing.reporterId === user.id;
    if (!canManageAny && !canManageOwn) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (action === 'reply') {
      if (!replyText && !replyAttachment) {
        return res.status(400).json({ success: false, error: 'message or attachment is required for reply' });
      }

      const currentThread = parseThreadFromReport(existing);
      const claimedThread = claimThreadByUser(currentThread, user);
      const withJoinThread = withAgentJoinSystemMessage(claimedThread, currentThread, user);
      const threadWithReply = appendThreadMessage(withJoinThread, {
        authorType: 'employee',
        authorId: user.id,
        authorName: user.name || user.username || user.email || 'Employee',
        text: replyText,
        attachment: replyAttachment,
      });
      const nextThread = threadWithReply;

      const reopenedStatus = ['resolved', 'dismissed'].includes(normalizeStatus(existing.status))
        ? 'in-progress'
        : normalizeStatus(existing.status);

      const replied = await prisma.report.update({
        where: { id: ticketId },
        data: {
          description: serializeThread(nextThread),
          status: reopenedStatus,
        },
        include: { reporter: true },
      });

      return res.status(200).json({ success: true, ticket: formatTicket(replied) });
    }

    if (action === 'internal-note') {
      if (!replyText) {
        return res.status(400).json({ success: false, error: 'message is required for internal notes' });
      }

      const currentThread = parseThreadFromReport(existing);
      const claimedThread = claimThreadByUser(currentThread, user);
      const withJoinThread = withAgentJoinSystemMessage(claimedThread, currentThread, user);
      const threadWithNote = appendThreadMessage(withJoinThread, {
        authorType: 'internal',
        authorId: user.id,
        authorName: user.name || user.username || user.email || 'Employee',
        text: replyText,
      });

      const noted = await prisma.report.update({
        where: { id: ticketId },
        data: {
          description: serializeThread(threadWithNote),
        },
        include: { reporter: true },
      });

      return res.status(200).json({ success: true, ticket: formatTicket(noted) });
    }

    if (action === 'transfer') {
      const targetDepartment = normalizeDepartment(req.body && req.body.department);
      const currentThread = parseThreadFromReport(existing);
      const existingDepartment = normalizeDepartment(
        normalizeThreadMeta(currentThread.meta).department || inferDepartmentFromReason(existing.reason)
      );

      if (targetDepartment === existingDepartment) {
        return res.status(200).json({ success: true, ticket: formatTicket(existing) });
      }

      const transferredThread = transferThreadDepartment(currentThread, user, targetDepartment);
      const transferredWithNote = appendThreadMessage(transferredThread, {
        authorType: 'system',
        authorId: user.id,
        authorName: 'System',
        text: `Ticket transferred from ${existingDepartment} to ${targetDepartment}.`,
      });

      const transferred = await prisma.report.update({
        where: { id: ticketId },
        data: {
          status: 'in-progress',
          description: serializeThread(transferredWithNote),
        },
        include: { reporter: true },
      });

      return res.status(200).json({ success: true, ticket: formatTicket(transferred) });
    }

    const statusActionRequested = action === 'status' || (!!(req.body && req.body.status) && !action);
    if (!statusActionRequested) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    if (!(req.body && req.body.status)) {
      return res.status(400).json({ success: false, error: 'status is required for status updates' });
    }

    const currentThread = parseThreadFromReport(existing);
    const claimedThreadBase = claimThreadByUser(currentThread, user);
    const claimedThread = withAgentJoinSystemMessage(claimedThreadBase, currentThread, user);

    const updated = await prisma.report.update({
      where: { id: ticketId },
      data: {
        status: nextStatus,
        description: serializeThread(claimedThread),
      },
      include: { reporter: true },
    });

    return res.status(200).json({ success: true, ticket: formatTicket(updated) });
  }

  if (req.method === 'DELETE') {
    const ticketId = String(((req.body && req.body.ticketId) || (req.query && req.query.ticketId) || '')).trim();
    if (!ticketId) {
      return res.status(400).json({ success: false, error: 'ticketId is required' });
    }

    const existing = await prisma.report.findUnique({
      where: { id: ticketId },
      include: { reporter: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const normalizedRole = normalizeRole(role);
    const canManageAny = isEmployeeRole(normalizedRole);
    const canManageOwn = existing.reporterId === user.id;
    if (!canManageAny && !canManageOwn) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await prisma.report.delete({
      where: { id: ticketId },
    });

    return res.status(200).json({ success: true, ticketId });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default async function handler(req, res) {
  try {
    applySecurityHeaders(res);
    if (!verifySameOriginRequest(req, res)) return;
    if (!enforceRateLimit(req, res, { namespace: 'api-tickets', maxRequests: 120, windowMs: 60 * 1000 })) return;

    const user = await requireUser(req, res);
    if (!user) return;

    const role = isEmailAdmin(user.email) ? 'owner' : (user.role || 'user');
    const mode = String((req.query && req.query.mode) || '').toLowerCase().trim();

    if (mode === 'customer') {
      return await handleCustomer(req, res, user);
    }

    if (mode === 'employee') {
      return await handleEmployee(req, res, user, role);
    }

    return res.status(400).json({
      success: false,
      error: 'mode query parameter is required (customer or employee)',
    });
  } catch (error) {
    console.error('tickets handler error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
}