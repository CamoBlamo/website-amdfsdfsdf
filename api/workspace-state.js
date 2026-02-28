import { prisma, unpackWorkspaceDescription, packWorkspaceDescription, findWorkspaceByIdentifier } from '../lib/db.js';
import { getUserFromRequest } from '../lib/auth-utils.js';

function ensureStateShape(state) {
  const safe = state && typeof state === 'object' ? state : {};
  return {
    members: Array.isArray(safe.members) ? safe.members : [],
    tasks: Array.isArray(safe.tasks) ? safe.tasks : [],
    announcements: Array.isArray(safe.announcements) ? safe.announcements : [],
    settings: {
      visibility: (safe.settings && safe.settings.visibility) || 'private',
      allowMemberTaskCreate: safe.settings && typeof safe.settings.allowMemberTaskCreate === 'boolean'
        ? safe.settings.allowMemberTaskCreate
        : true,
      defaultTaskStatus: (safe.settings && safe.settings.defaultTaskStatus) || 'todo',
    },
    shortId: (safe.shortId && typeof safe.shortId === 'string') ? safe.shortId : 'WS-UNKNOWN',
  };
}

function isWorkspaceAdmin(user, workspace, state) {
  if (!user) return false;
  if ((user.role || '').toLowerCase() === 'owner') return true;
  if (workspace.userId === user.id) return true;

  const member = state.members.find((m) => m.id === user.id || (user.email && m.email === user.email));
  return !!(member && ['workspace-admin', 'head-developer'].includes(member.role));
}

function canViewWorkspaceSettings(user, workspace, state) {
  if (!user) return false;
  if ((user.role || '').toLowerCase() === 'owner') return true;
  if (workspace.userId === user.id) return true;

  const member = state.members.find((m) => m.id === user.id || (user.email && m.email === user.email));
  // Allow workspace-admin, head-developer, and moderator to view settings
  return !!(member && ['workspace-admin', 'head-developer', 'developer'].includes(member.role));
}

function hasWorkspaceAccess(user, workspace, state) {
  if (!user) return false;
  if ((user.role || '').toLowerCase() === 'owner') return true;
  if (workspace.userId === user.id) return true;

  return !!state.members.find((m) => m.id === user.id || (user.email && m.email === user.email));
}

function attachCurrentUserMember(user, workspace, state) {
  const member = state.members.find((m) => m.id === user.id || (user.email && m.email === user.email));
  const isOwner = (user.role || '').toLowerCase() === 'owner';
  const isWorkspaceOwner = workspace.userId === user.id;

  if (!member) {
    state.members.unshift({
      id: user.id,
      email: user.email || '',
      name: user.name || user.username || user.email || 'You',
      role: isOwner || isWorkspaceOwner ? 'workspace-admin' : 'developer',
      joinedAt: new Date().toISOString(),
    });
    return;
  }

  if (isOwner || isWorkspaceOwner) {
    member.role = 'workspace-admin';
  }
}

export default async function handler(req, res) {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const workspaceId = req.query.id;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace id is required' });
    }

    // Support both UUID and short ID
    const workspace = await findWorkspaceByIdentifier(workspaceId);

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    const unpacked = unpackWorkspaceDescription(workspace.description || '');
    let state = ensureStateShape(unpacked.state);

    attachCurrentUserMember(user, workspace, state);

    if (!hasWorkspaceAccess(user, workspace, state)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (req.method === 'GET') {
      const packedDescription = packWorkspaceDescription(unpacked.description, state);
      if (packedDescription !== workspace.description) {
        await prisma.workspace.update({
          where: { id: workspace.id },
          data: { description: packedDescription },
        });
      }

      return res.status(200).json({
        success: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          description: unpacked.description,
          userId: workspace.userId,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        },
        state,
      });
    }

    if (req.method === 'PUT') {
      const isAdmin = isWorkspaceAdmin(user, workspace, state);
      const body = req.body || {};
      const nextState = ensureStateShape(body.state);

      const nextName = isAdmin
        ? (body.name || workspace.name || '').trim()
        : workspace.name;
      const nextDescription = isAdmin
        ? (typeof body.description === 'string' ? body.description : unpacked.description)
        : unpacked.description;

      if (!isAdmin) {
        nextState.members = state.members;
        nextState.announcements = state.announcements;
        nextState.settings = state.settings;
      }

      const packed = packWorkspaceDescription(nextDescription, nextState);
      const updated = await prisma.workspace.update({
        where: { id: workspace.id },
        data: {
          name: nextName || workspace.name,
          description: packed,
        },
      });

      return res.status(200).json({
        success: true,
        workspace: {
          id: updated.id,
          name: updated.name,
          description: nextDescription,
          userId: updated.userId,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
        state: nextState,
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('workspace-state handler error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
}
