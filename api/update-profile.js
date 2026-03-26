import { prisma } from '../lib/db.js';
import { getUserFromRequest } from '../lib/auth-utils.js';
import { applySecurityHeaders, verifySameOriginRequest, enforceRateLimit } from '../lib/api-security.js';

export default async function handler(req, res) {
  try {
    applySecurityHeaders(res);
    if (!verifySameOriginRequest(req, res)) return;
    if (!enforceRateLimit(req, res, { namespace: 'api-update-profile', maxRequests: 40, windowMs: 60 * 1000 })) return;

    const tokenUser = getUserFromRequest(req);
    if (!tokenUser) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (req.method !== 'POST' && req.method !== 'PUT') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { username } = req.body || {};

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Username is required and cannot be empty' });
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
      return res.status(400).json({ success: false, error: 'Username must be 3 to 32 characters long' });
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
      return res.status(400).json({ success: false, error: 'Username contains invalid characters' });
    }

    // Check if username is already taken
    const existing = await prisma.user.findFirst({
      where: {
        username: trimmedUsername,
        id: { not: tokenUser.id },
      },
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'Username is already taken' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: tokenUser.id },
      data: { username: trimmedUsername },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
      },
    });

    return res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
