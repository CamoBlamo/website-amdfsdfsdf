import { getUserWorkspaces, createWorkspace } from '../lib/db.js';
import { getUserFromRequest } from '../lib/auth-utils.js';
import { applySecurityHeaders, verifySameOriginRequest, enforceRateLimit } from '../lib/api-security.js';

export default async function handler(req, res) {
  try {
    applySecurityHeaders(res);
    if (!verifySameOriginRequest(req, res)) return;
    if (!enforceRateLimit(req, res, { namespace: 'api-workspaces', maxRequests: 80, windowMs: 60 * 1000 })) return;

    const user = getUserFromRequest(req);

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method === 'GET') {
      try {
        const workspaces = await getUserWorkspaces(user.id);
        return res.status(200).json({ workspaces });
      } catch (error) {
        console.error('Get workspaces error:', error);
        return res.status(500).json({ error: error.message });
      }
    }

    if (req.method === 'POST') {
      const { name, description } = req.body || {};
      const safeName = String(name || '').trim();
      const safeDescription = String(description || '').trim();

      if (!safeName) {
        return res.status(400).json({ error: 'Workspace name required' });
      }

      if (safeName.length > 120) {
        return res.status(400).json({ error: 'Workspace name too long (max 120 chars)' });
      }

      if (safeDescription.length > 2000) {
        return res.status(400).json({ error: 'Workspace description too long (max 2000 chars)' });
      }

      try {
        const workspace = await createWorkspace(user.id, safeName, safeDescription);
        return res.status(201).json({ workspace });
      } catch (error) {
        console.error('Create workspace error:', error);
        return res.status(500).json({ error: error.message });
      }
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Workspaces handler fatal error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

