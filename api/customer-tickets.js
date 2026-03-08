import { prisma, findWorkspaceByIdentifier, unpackWorkspaceDescription } from '../lib/db.js';
import { getUserFromRequest } from '../lib/auth-utils.js';

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

function normalizeCategory(value) {
  const normalized = String(value || 'other').toLowerCase().trim();
  if (!normalized) return 'other';
  return normalized;
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

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
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
    const description = message.slice(0, 5000);

    const report = await prisma.report.create({
      data: {
        workspaceId: workspace.id,
        reporterId: user.id,
        reason,
        description,
        status: 'pending',
      },
    });

    return res.status(201).json({
      success: true,
      ticket: {
        id: report.id,
        workspaceId: report.workspaceId,
        reason: report.reason,
        description: report.description || '',
        status: report.status,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    console.error('customer-tickets handler error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
}
