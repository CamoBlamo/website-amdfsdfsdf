import { prisma, findWorkspaceByIdentifier, unpackWorkspaceDescription } from '../lib/db.js';
import { getUserFromRequest, isEmailAdmin } from '../lib/auth-utils.js';

const EMPLOYEE_ROLES = ['staff', 'moderator', 'administrator', 'co-owner', 'owner'];
const TICKET_STATUSES = ['pending', 'in-progress', 'resolved', 'dismissed'];
const CHAT_AUTHOR_TYPES = ['customer', 'employee', 'system'];
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES_PER_TICKET = 150;

function normalizeRole(role) {
  const value = String(role || 'user').toLowerCase().trim();
  if (value === 'admin') return 'administrator';
  if (value === 'coowner') return 'co-owner';
  return value;
}

function isEmployeeRole(role) {
  return EMPLOYEE_ROLES.includes(normalizeRole(role));
}

function normalizeStatus(value) {
  const normalized = String(value || 'pending').toLowerCase().trim();
  return TICKET_STATUSES.includes(normalized) ? normalized : 'pending';
}

function normalizeCategory(value) {
  const normalized = String(value || 'other').toLowerCase().trim();
  return normalized || 'other';
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
  if (!text) return null;

  return {
    id: String(input.id || `${createMessageId()}_${index}`),
    authorType: normalizeChatAuthorType(input.authorType),
    authorId: input.authorId ? String(input.authorId) : '',
    authorName: String(input.authorName || 'User').slice(0, 80),
    text,
    createdAt: formatTimestamp(input.createdAt),
  };
}

function normalizeThreadMeta(input) {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const claimedById = input.claimedById ? String(input.claimedById) : '';
  const claimedByName = input.claimedByName ? String(input.claimedByName).slice(0, 80) : '';
  const claimedAtValue = input.claimedAt ? new Date(input.claimedAt) : null;
  const claimedAt = claimedAtValue && !Number.isNaN(claimedAtValue.getTime())
    ? claimedAtValue.toISOString()
    : '';

  if (!claimedById && !claimedByName) {
    return {};
  }

  return {
    claimedById,
    claimedByName: claimedByName || 'Employee',
    claimedAt,
  };
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
  if (!text) {
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

function sortByActivityDesc(tickets) {
  return [...tickets].sort((a, b) => {
    const aTime = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function hasWorkspaceAccess(user, workspace) {
  if (!user || !workspace) return false;
  if (workspace.userId === user.id) return true;

  const unpacked = unpackWorkspaceDescription(workspace.description || '');
  const members = Array.isArray(unpacked.state?.members) ? unpacked.state.members : [];

  return members.some((member) => {
    if (member.id && member.id === user.id) {
      return true;
    }

    if (!user.email || !member.email) {
      return false;
    }

    return String(member.email).toLowerCase() === String(user.email).toLowerCase();
  });
}

function formatTicket(report) {
  const thread = parseThreadFromReport(report);
  const lastMessage = getLastMessage(thread.messages);
  const claimMeta = normalizeThreadMeta(thread.meta);

  return {
    id: report.id,
    workspaceId: report.workspaceId,
    workspaceName: report.workspace?.name || 'Unknown Workspace',
    reporterId: report.reporterId,
    reporterName: report.reporter?.name || report.reporter?.username || report.reporter?.email || 'Unknown',
    reporterEmail: report.reporter?.email || '',
    reason: report.reason,
    description: lastMessage ? lastMessage.text : '',
    messages: thread.messages,
    status: normalizeStatus(report.status),
    createdAt: report.createdAt,
    lastMessageAt: lastMessage ? lastMessage.createdAt : formatTimestamp(report.createdAt),
    claimedById: claimMeta.claimedById || '',
    claimedByName: claimMeta.claimedByName || '',
    claimedAt: claimMeta.claimedAt || '',
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
      include: { workspace: true, reporter: true },
    });

    return res.status(200).json({
      success: true,
      tickets: sortByActivityDesc(reports.map(formatTicket)),
    });
  }

  if (req.method !== 'POST') {
    if (req.method !== 'PATCH') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const ticketId = String((req.body && req.body.ticketId) || '').trim();
    const action = String((req.body && req.body.action) || '').toLowerCase().trim();
    const replyText = normalizeMessageText(req.body && req.body.message);

    if (!ticketId) {
      return res.status(400).json({ success: false, error: 'ticketId is required' });
    }

    const existing = await prisma.report.findUnique({
      where: { id: ticketId },
      include: { workspace: true, reporter: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    if (existing.reporterId !== user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (action !== 'reply' || !replyText) {
      return res.status(400).json({ success: false, error: 'action=reply and message are required' });
    }

    const currentThread = parseThreadFromReport(existing);
    const nextThread = appendThreadMessage(currentThread, {
      authorType: 'customer',
      authorId: user.id,
      authorName: user.name || user.username || user.email || 'Customer',
      text: replyText,
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
      include: { workspace: true, reporter: true },
    });

    return res.status(200).json({ success: true, ticket: formatTicket(updated) });
  }

  const workspaceId = String((req.body && req.body.workspaceId) || '').trim();
  const category = normalizeCategory(req.body && req.body.category);
  const subject = String((req.body && req.body.subject) || '').trim();
  const message = String((req.body && req.body.message) || '').trim();

  if (!workspaceId || !subject || !message) {
    return res.status(400).json({
      success: false,
      error: 'workspaceId, subject, and message are required',
    });
  }

  const workspace = await findWorkspaceByIdentifier(workspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  if (!hasWorkspaceAccess(user, workspace)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const reason = `[${category}] ${subject}`.slice(0, 180);
  const thread = appendThreadMessage({ version: 1, messages: [] }, {
    authorType: 'customer',
    authorId: user.id,
    authorName: user.name || user.username || user.email || 'Customer',
    text: message,
  });

  const report = await prisma.report.create({
    data: {
      workspaceId: workspace.id,
      reporterId: user.id,
      reason,
      description: serializeThread(thread),
      status: 'pending',
    },
    include: { workspace: true, reporter: true },
  });

  return res.status(201).json({
    success: true,
    ticket: formatTicket(report),
  });
}

async function handleEmployee(req, res, user, role) {
  if (!isEmployeeRole(role)) {
    return res.status(403).json({ success: false, error: 'Employee access required' });
  }

  if (req.method === 'GET') {
    const scope = String((req.query && req.query.scope) || 'all').toLowerCase();
    const where = scope === 'mine' ? { reporterId: user.id } : {};

    const reports = await prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { workspace: true, reporter: true },
    });

    return res.status(200).json({
      success: true,
      tickets: sortByActivityDesc(reports.map(formatTicket)),
    });
  }

  if (req.method === 'POST') {
    const workspaceId = String((req.body && req.body.workspaceId) || '').trim();
    const category = String((req.body && req.body.category) || 'other').trim().toLowerCase();
    const subject = String((req.body && req.body.subject) || '').trim();
    const message = String((req.body && req.body.message) || '').trim();

    if (!workspaceId || !subject || !message) {
      return res.status(400).json({ success: false, error: 'workspaceId, subject, and message are required' });
    }

    const workspace = await findWorkspaceByIdentifier(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
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

    const created = await prisma.report.create({
      data: {
        workspaceId: workspace.id,
        reporterId: user.id,
        reason,
        description: serializeThread(thread),
        status: 'pending',
      },
      include: { workspace: true, reporter: true },
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

    if (!ticketId) {
      return res.status(400).json({ success: false, error: 'ticketId is required' });
    }

    const existing = await prisma.report.findUnique({
      where: { id: ticketId },
      include: { workspace: true, reporter: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const normalizedRole = normalizeRole(role);
    const canManageAny = ['administrator', 'co-owner', 'owner'].includes(normalizedRole);
    const canManageOwn = existing.reporterId === user.id;
    if (!canManageAny && !canManageOwn) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (action === 'reply') {
      if (!replyText) {
        return res.status(400).json({ success: false, error: 'message is required for reply' });
      }

      const currentThread = parseThreadFromReport(existing);
      const threadWithReply = appendThreadMessage(currentThread, {
        authorType: 'employee',
        authorId: user.id,
        authorName: user.name || user.username || user.email || 'Employee',
        text: replyText,
      });
      const nextThread = claimThreadByUser(threadWithReply, user);

      const reopenedStatus = ['resolved', 'dismissed'].includes(normalizeStatus(existing.status))
        ? 'in-progress'
        : normalizeStatus(existing.status);

      const replied = await prisma.report.update({
        where: { id: ticketId },
        data: {
          description: serializeThread(nextThread),
          status: reopenedStatus,
        },
        include: { workspace: true, reporter: true },
      });

      return res.status(200).json({ success: true, ticket: formatTicket(replied) });
    }

    const statusActionRequested = action === 'status' || (!!(req.body && req.body.status) && !action);
    if (!statusActionRequested) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    if (!(req.body && req.body.status)) {
      return res.status(400).json({ success: false, error: 'status is required for status updates' });
    }

    const currentThread = parseThreadFromReport(existing);
    const claimedThread = claimThreadByUser(currentThread, user);

    const updated = await prisma.report.update({
      where: { id: ticketId },
      data: {
        status: nextStatus,
        description: serializeThread(claimedThread),
      },
      include: { workspace: true, reporter: true },
    });

    return res.status(200).json({ success: true, ticket: formatTicket(updated) });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default async function handler(req, res) {
  try {
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