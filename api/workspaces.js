import { getUserWorkspaces, createWorkspace } from '../lib/db.js';
import { getUserFromRequest } from '../lib/auth-utils.js';

export default async function handler(req, res) {
  try {
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
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Workspace name required' });
      }

      try {
        const workspace = await createWorkspace(user.id, name, description || '');
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
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
}
