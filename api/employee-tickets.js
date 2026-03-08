import { prisma } from '../lib/db.js';
import { getUserFromRequest, isEmailAdmin } from '../lib/auth-utils.js';

const EMPLOYEE_ROLES = ['staff', 'moderator', 'administrator', 'co-owner', 'owner'];
const TICKET_STATUSES = ['pending', 'in-progress', 'resolved', 'dismissed'];

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

function formatTicket(report) {
  return {
    id: report.id,
    workspaceId: report.workspaceId,
    workspaceName: report.workspace?.name || 'Unknown Workspace',
    reporterId: report.reporterId,
    reporterName: report.reporter?.name || report.reporter?.username || report.reporter?.email || 'Unknown',
    reporterEmail: report.reporter?.email || '',
    reason: report.reason,
    description: report.description || '',
    status: normalizeStatus(report.status),
    createdAt: report.createdAt,
  };
}

export default async function handler(req, res) {
  try {
    const tokenUser = getUserFromRequest(req);
    if (!tokenUser) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({ where: { id: tokenUser.id } });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const role = isEmailAdmin(user.email) ? 'owner' : (user.role || 'user');
    if (!isEmployeeRole(role)) {
      return res.status(403).json({ success: false, error: 'Employee access required' });
    }

    if (req.method === 'GET') {
      const scope = String(req.query.scope || 'mine').toLowerCase();
      const where = scope === 'all' && ['administrator', 'co-owner', 'owner'].includes(normalizeRole(role))
        ? {}
        : { reporterId: user.id };

      const reports = await prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { workspace: true, reporter: true },
      });

      return res.status(200).json({
        success: true,
        tickets: reports.map(formatTicket),
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

      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) {
        return res.status(404).json({ success: false, error: 'Workspace not found' });
      }

      const safeCategory = category || 'other';
      const reason = `[${safeCategory}] ${subject}`.slice(0, 180);
      const description = message.slice(0, 5000);

      const created = await prisma.report.create({
        data: {
          workspaceId: workspace.id,
          reporterId: user.id,
          reason,
          description,
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
      const nextStatus = normalizeStatus(req.body && req.body.status);

      if (!ticketId) {
        return res.status(400).json({ success: false, error: 'ticketId is required' });
      }

      const existing = await prisma.report.findUnique({ where: { id: ticketId } });
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Ticket not found' });
      }

      const normalizedRole = normalizeRole(role);
      const canManageAny = ['administrator', 'co-owner', 'owner'].includes(normalizedRole);
      const canManageOwn = existing.reporterId === user.id;
      if (!canManageAny && !canManageOwn) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      const updated = await prisma.report.update({
        where: { id: ticketId },
        data: { status: nextStatus },
        include: { workspace: true, reporter: true },
      });

      return res.status(200).json({ success: true, ticket: formatTicket(updated) });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('employee-tickets handler error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
}
