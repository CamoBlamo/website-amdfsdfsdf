import { prisma } from '../lib/db.js';
import { getUserFromRequest, isEmailAdmin } from '../lib/auth-utils.js';

async function getAdminContext(req, res) {
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

  const role = isEmailAdmin(user.email) ? 'owner' : (user.role || 'user');
  return { user, role };
}

function roleAllowed(role, allowed) {
  return allowed.includes(role);
}

export default async function handler(req, res) {
  const ctx = await getAdminContext(req, res);
  if (!ctx) return;

  const section = String(req.query.section || '').toLowerCase();
  if (!section) {
    return res.status(400).json({ success: false, errors: ['Missing section'] });
  }

  const role = ctx.role;

  if (section === 'users') {
    if (!roleAllowed(role, ['owner', 'co-owner', 'administrator'])) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (req.method === 'GET') {
      try {
        const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
        return res.status(200).json({
          success: true,
          users: users.map((u) => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            role: isEmailAdmin(u.email) ? 'owner' : u.role,
            subscriptionStatus: u.subscriptionStatus,
            createdAt: u.createdAt,
          })),
        });
      } catch (error) {
        console.error('Admin users list error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    if (req.method === 'PATCH') {
      const { userId, action, value } = req.body || {};
      if (!userId || !action) {
        return res.status(400).json({ success: false, errors: ['Missing parameters'] });
      }

      try {
        if (action === 'role') {
          const newRole = String(value || '').toLowerCase();
          const allowed = ['user', 'moderator', 'administrator', 'co-owner', 'owner'];
          if (!allowed.includes(newRole)) {
            return res.status(400).json({ success: false, errors: ['Invalid role'] });
          }
          const updated = await prisma.user.update({
            where: { id: userId },
            data: { role: newRole },
          });
          return res.status(200).json({ success: true, user: updated });
        }

        if (action === 'subscription') {
          const status = String(value || '').toLowerCase();
          const allowed = ['free', 'lite', 'none'];
          if (!allowed.includes(status)) {
            return res.status(400).json({ success: false, errors: ['Invalid status'] });
          }
          const updated = await prisma.user.update({
            where: { id: userId },
            data: { subscriptionStatus: status },
          });
          return res.status(200).json({ success: true, user: updated });
        }

        return res.status(400).json({ success: false, errors: ['Invalid action'] });
      } catch (error) {
        console.error('Admin users update error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    if (req.method === 'DELETE') {
      const userId = req.query.id || (req.body && req.body.userId);
      if (!userId) {
        return res.status(400).json({ success: false, errors: ['Missing userId'] });
      }

      try {
        await prisma.user.delete({ where: { id: String(userId) } });
        return res.status(200).json({ success: true });
      } catch (error) {
        console.error('Admin delete user error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    return res.status(405).json({ success: false, errors: ['Method not allowed'] });
  }

  if (section === 'workspaces') {
    if (!roleAllowed(role, ['owner', 'co-owner', 'administrator'])) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (req.method === 'GET') {
      try {
        const workspaces = await prisma.workspace.findMany({
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        });

        return res.status(200).json({
          success: true,
          workspaces: workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            createdAt: w.createdAt,
            creatorName: w.user?.name || w.user?.username || w.user?.email || 'Unknown',
            creatorEmail: w.user?.email || 'Unknown',
          })),
        });
      } catch (error) {
        console.error('Admin workspaces list error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    if (req.method === 'DELETE') {
      const workspaceId = req.query.id || (req.body && req.body.workspaceId);
      if (!workspaceId) {
        return res.status(400).json({ success: false, errors: ['Missing workspaceId'] });
      }

      try {
        await prisma.workspace.delete({ where: { id: String(workspaceId) } });
        return res.status(200).json({ success: true });
      } catch (error) {
        console.error('Admin delete workspace error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    return res.status(405).json({ success: false, errors: ['Method not allowed'] });
  }

  if (section === 'reports') {
    if (!roleAllowed(role, ['owner', 'co-owner', 'administrator', 'moderator'])) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (req.method === 'GET') {
      try {
        const reports = await prisma.report.findMany({
          orderBy: { createdAt: 'desc' },
          include: { workspace: true, reporter: true },
        });

        return res.status(200).json({
          success: true,
          reports: reports.map((r) => ({
            id: r.id,
            workspaceName: r.workspace?.name || 'Unknown',
            reporterName: r.reporter?.name || r.reporter?.username || r.reporter?.email || 'Unknown',
            reporterEmail: r.reporter?.email || 'Unknown',
            reason: r.reason,
            description: r.description,
            status: r.status,
            createdAt: r.createdAt,
          })),
        });
      } catch (error) {
        console.error('Admin reports list error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    if (req.method === 'PATCH') {
      const { reportId, status } = req.body || {};
      if (!reportId || !status) {
        return res.status(400).json({ success: false, errors: ['Missing parameters'] });
      }

      try {
        const updated = await prisma.report.update({
          where: { id: String(reportId) },
          data: { status: String(status) },
        });
        return res.status(200).json({ success: true, report: updated });
      } catch (error) {
        console.error('Admin reports update error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    return res.status(405).json({ success: false, errors: ['Method not allowed'] });
  }

  if (section === 'announcements') {
    if (!roleAllowed(role, ['owner', 'co-owner', 'administrator'])) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (req.method === 'GET') {
      try {
        const announcements = await prisma.announcement.findMany({
          orderBy: { createdAt: 'desc' },
        });
        return res.status(200).json({ success: true, announcements });
      } catch (error) {
        console.error('Admin announcements list error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    if (req.method === 'POST') {
      const { title, message, level } = req.body || {};
      if (!message) {
        return res.status(400).json({ success: false, errors: ['Message is required'] });
      }

      try {
        const announcement = await prisma.announcement.create({
          data: {
            title: title || null,
            message,
            level: level || 'info',
            author: ctx.user.name || ctx.user.username || ctx.user.email || 'Admin',
            authorId: ctx.user.id,
          },
        });
        return res.status(201).json({ success: true, announcement });
      } catch (error) {
        console.error('Admin announcements create error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    return res.status(405).json({ success: false, errors: ['Method not allowed'] });
  }

  return res.status(400).json({ success: false, errors: ['Invalid section'] });
}
