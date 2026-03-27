import { prisma, findWorkspaceByIdentifier, unpackWorkspaceDescription, packWorkspaceDescription } from '../lib/db.js';
import { getUserFromRequest, isEmailAdmin } from '../lib/auth-utils.js';
import { applySecurityHeaders, verifySameOriginRequest, enforceRateLimit } from '../lib/api-security.js';

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

const ROLE_ORDER = ['user', 'staff', 'moderator', 'administrator', 'co-owner', 'owner'];

function normalizeRole(role) {
  const value = String(role || 'user').toLowerCase().trim();
  if (value === 'admin') return 'administrator';
  if (value === 'coowner') return 'co-owner';
  return ROLE_ORDER.includes(value) ? value : 'user';
}

function roleRank(role) {
  return ROLE_ORDER.indexOf(normalizeRole(role));
}

function effectiveRoleForUser(user) {
  return isEmailAdmin(user && user.email) ? 'owner' : normalizeRole(user && user.role);
}

function canManageTarget(actorRole, targetRole) {
  return roleRank(actorRole) > roleRank(targetRole);
}

function getReportDescriptionPreview(value) {
  const raw = String(value || '');
  if (!raw.trim()) return '';

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return raw;
    }

    const lastMessage = parsed.messages[parsed.messages.length - 1];
    const text = String(lastMessage && (lastMessage.text || lastMessage.message) || '').trim();
    return text || raw;
  } catch (error) {
    return raw;
  }
}

function getWorkspaceInspectorState(rawDescription) {
  const unpacked = unpackWorkspaceDescription(rawDescription || '');
  const state = unpacked && typeof unpacked.state === 'object' ? unpacked.state : {};
  return {
    unpackedDescription: unpacked.description || '',
    state: {
      members: Array.isArray(state.members) ? state.members : [],
      tasks: Array.isArray(state.tasks) ? state.tasks : [],
      announcements: Array.isArray(state.announcements) ? state.announcements : [],
      settings: {
        visibility: state.settings && typeof state.settings.visibility === 'string' ? state.settings.visibility : 'private',
        allowMemberTaskCreate: state.settings && typeof state.settings.allowMemberTaskCreate === 'boolean'
          ? state.settings.allowMemberTaskCreate
          : true,
        defaultTaskStatus: state.settings && typeof state.settings.defaultTaskStatus === 'string'
          ? state.settings.defaultTaskStatus
          : 'todo',
      },
      shortId: typeof state.shortId === 'string' && state.shortId.trim() ? state.shortId.trim() : 'WS-UNKNOWN',
    },
  };
}

function buildTrackCheckpoints(workspace, state, unpackedDescription) {
  const hasDescription = !!String(unpackedDescription || '').trim();
  const hasMembers = state.members.length > 0;
  const hasTasks = state.tasks.length > 0;
  const hasAnnouncements = state.announcements.length > 0;
  const isPublic = state.settings.visibility === 'public';
  const canMembersCreateTasks = !!state.settings.allowMemberTaskCreate;

  return {
    support: [
      {
        tone: hasMembers ? 'ready' : 'attention',
        label: hasMembers ? 'Workspace has assigned members' : 'No members assigned yet',
      },
      {
        tone: canMembersCreateTasks ? 'ready' : 'attention',
        label: canMembersCreateTasks ? 'Members can create tasks for follow-up' : 'Task creation is locked for members',
      },
      {
        tone: hasDescription ? 'ready' : 'attention',
        label: hasDescription ? 'Workspace context is documented' : 'Description is missing support context',
      },
    ],
    beta: [
      {
        tone: hasTasks ? 'ready' : 'attention',
        label: hasTasks ? 'Beta work queue exists' : 'No tasks found for beta follow-up',
      },
      {
        tone: state.settings.defaultTaskStatus ? 'ready' : 'attention',
        label: `Default task status: ${state.settings.defaultTaskStatus || 'not set'}`,
      },
      {
        tone: hasAnnouncements ? 'ready' : 'attention',
        label: hasAnnouncements ? 'Announcements exist for testers' : 'No internal tester announcements yet',
      },
    ],
    pr: [
      {
        tone: hasDescription ? 'ready' : 'attention',
        label: hasDescription ? 'Workspace has a shareable description' : 'Public-facing summary still needs copy',
      },
      {
        tone: isPublic ? 'ready' : 'attention',
        label: isPublic ? 'Visibility is public-ready' : 'Visibility is private/internal only',
      },
      {
        tone: state.shortId && state.shortId !== 'WS-UNKNOWN' ? 'ready' : 'attention',
        label: state.shortId && state.shortId !== 'WS-UNKNOWN' ? `Short ID available: ${state.shortId}` : 'Short ID missing',
      },
    ],
  };
}

function buildWorkspaceInspectorPayload(workspaceRecord) {
  const { unpackedDescription, state } = getWorkspaceInspectorState(workspaceRecord.description || '');

  return {
    workspace: {
      id: workspaceRecord.id,
      shortId: state.shortId,
      name: workspaceRecord.name,
      description: unpackedDescription,
      createdAt: workspaceRecord.createdAt,
      updatedAt: workspaceRecord.updatedAt,
      ownerName: workspaceRecord.user?.name || workspaceRecord.user?.username || workspaceRecord.user?.email || 'Unknown',
      ownerEmail: workspaceRecord.user?.email || 'Unknown',
      lookupHref: `/workspace.html?id=${encodeURIComponent(state.shortId || workspaceRecord.id)}`,
    },
    metrics: {
      members: state.members.length,
      tasks: state.tasks.length,
      announcements: state.announcements.length,
      visibility: state.settings.visibility,
      allowMemberTaskCreate: state.settings.allowMemberTaskCreate,
      defaultTaskStatus: state.settings.defaultTaskStatus,
    },
    tracks: buildTrackCheckpoints(workspaceRecord, state, unpackedDescription),
  };
}

export default async function handler(req, res) {
  try {
    applySecurityHeaders(res);
    if (!verifySameOriginRequest(req, res)) return;
    if (!enforceRateLimit(req, res, { namespace: 'api-admin', maxRequests: 80, windowMs: 60 * 1000 })) return;

    const ctx = await getAdminContext(req, res);
    if (!ctx) return;

    const section = String(req.query.section || '').toLowerCase();
    if (!section) {
      return res.status(400).json({ success: false, errors: ['Missing section'] });
    }

    const role = normalizeRole(ctx.role);

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
        const targetUser = await prisma.user.findUnique({ where: { id: String(userId) } });
        if (!targetUser) {
          return res.status(404).json({ success: false, errors: ['Target user not found'] });
        }

        const actorRole = normalizeRole(role);
        const targetRole = effectiveRoleForUser(targetUser);

        if (!canManageTarget(actorRole, targetRole)) {
          return res.status(403).json({ success: false, errors: ['Forbidden: insufficient role level'] });
        }

        if (action === 'role') {
          const newRole = String(value || '').toLowerCase();
          const allowed = ['user', 'staff', 'moderator', 'administrator', 'co-owner', 'owner'];
          if (!allowed.includes(newRole)) {
            return res.status(400).json({ success: false, errors: ['Invalid role'] });
          }

          const normalizedNewRole = normalizeRole(newRole);
          if (normalizedNewRole === 'owner' && !isEmailAdmin(targetUser.email)) {
            return res.status(400).json({ success: false, errors: ['Owner role is restricted to configured owner emails'] });
          }

          if (roleRank(actorRole) <= roleRank(normalizedNewRole)) {
            return res.status(403).json({ success: false, errors: ['Forbidden: cannot assign role equal or above your own'] });
          }

          const updated = await prisma.user.update({
            where: { id: userId },
            data: { role: normalizedNewRole },
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
        const targetUser = await prisma.user.findUnique({ where: { id: String(userId) } });
        if (!targetUser) {
          return res.status(404).json({ success: false, errors: ['Target user not found'] });
        }

        const actorRole = normalizeRole(role);
        const targetRole = effectiveRoleForUser(targetUser);
        if (!canManageTarget(actorRole, targetRole)) {
          return res.status(403).json({ success: false, errors: ['Forbidden: insufficient role level'] });
        }

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
            description: getReportDescriptionPreview(r.description),
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

  if (section === 'workspace-inspector') {
    if (!roleAllowed(role, ['staff', 'moderator', 'administrator', 'co-owner', 'owner'])) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const workspaceId = String(req.query.id || (req.body && req.body.workspaceId) || '').trim();
    if (!workspaceId) {
      return res.status(400).json({ success: false, errors: ['Missing workspaceId'] });
    }

    if (req.method === 'GET') {
      try {
        const found = await findWorkspaceByIdentifier(workspaceId);
        if (!found) {
          return res.status(404).json({ success: false, errors: ['Workspace not found'] });
        }

        const workspace = await prisma.workspace.findUnique({
          where: { id: found.id },
          include: { user: true },
        });

        if (!workspace) {
          return res.status(404).json({ success: false, errors: ['Workspace not found'] });
        }

        return res.status(200).json({
          success: true,
          ...buildWorkspaceInspectorPayload(workspace),
        });
      } catch (error) {
        console.error('Workspace inspector load error:', error);
        return res.status(500).json({ success: false, errors: ['Server error'] });
      }
    }

    if (req.method === 'PATCH') {
      try {
        const found = await findWorkspaceByIdentifier(workspaceId);
        if (!found) {
          return res.status(404).json({ success: false, errors: ['Workspace not found'] });
        }

        const workspace = await prisma.workspace.findUnique({
          where: { id: found.id },
          include: { user: true },
        });

        if (!workspace) {
          return res.status(404).json({ success: false, errors: ['Workspace not found'] });
        }

        const { unpackedDescription, state } = getWorkspaceInspectorState(workspace.description || '');
        const nextSettings = req.body && req.body.settings ? req.body.settings : {};
        const visibility = ['private', 'internal', 'public'].includes(String(nextSettings.visibility || '').toLowerCase())
          ? String(nextSettings.visibility).toLowerCase()
          : state.settings.visibility;
        const defaultTaskStatus = String(nextSettings.defaultTaskStatus || state.settings.defaultTaskStatus || 'todo').trim().slice(0, 40) || 'todo';
        const allowMemberTaskCreate = typeof nextSettings.allowMemberTaskCreate === 'boolean'
          ? nextSettings.allowMemberTaskCreate
          : state.settings.allowMemberTaskCreate;

        const packed = packWorkspaceDescription(unpackedDescription, {
          ...state,
          settings: {
            visibility,
            defaultTaskStatus,
            allowMemberTaskCreate,
          },
        });

        const updated = await prisma.workspace.update({
          where: { id: workspace.id },
          data: { description: packed },
          include: { user: true },
        });

        return res.status(200).json({
          success: true,
          message: 'Workspace configuration updated.',
          ...buildWorkspaceInspectorPayload(updated),
        });
      } catch (error) {
        console.error('Workspace inspector update error:', error);
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
            author: ctx.user.username || ctx.user.name || ctx.user.email || 'Admin',
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
  } catch (error) {
    console.error('Admin handler error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
}

