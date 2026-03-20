import { prisma } from '../lib/db.js';
import { getUserFromRequest } from '../lib/auth-utils.js';

export default async function handler(req, res) {
  try {
    const tokenUser = getUserFromRequest(req);
    if (!tokenUser) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (req.method === 'GET') {
      // Fetch current preferences for the user
      const user = await prisma.user.findUnique({
        where: { id: tokenUser.id },
        select: { preferences: true },
      });

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        preferences: user.preferences || {},
      });
    } else if (req.method === 'POST' || req.method === 'PUT') {
      // Update user preferences
      const { preferences } = req.body;

      if (!preferences || typeof preferences !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid preferences object' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: tokenUser.id },
        data: {
          preferences: preferences,
        },
        select: {
          id: true,
          preferences: true,
        },
      });

      return res.status(200).json({
        success: true,
        preferences: updatedUser.preferences,
      });
    } else {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Preferences handler error:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
