import { prisma } from '../lib/db.js';
import { getUserFromRequest } from '../lib/auth-utils.js';

export default async function handler(req, res) {
  try {
    const tokenUser = getUserFromRequest(req);
    console.log('update-profile: tokenUser =', tokenUser);
    if (!tokenUser) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (req.method !== 'POST' && req.method !== 'PUT') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { username } = req.body;
    console.log('update-profile: incoming username =', username);

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Username is required and cannot be empty' });
    }

    const trimmedUsername = username.trim();
    console.log('update-profile: trimmed username =', trimmedUsername);

    // Check if username is already taken
    const existing = await prisma.user.findFirst({
      where: {
        username: trimmedUsername,
        id: { not: tokenUser.id },
      },
    });

    if (existing) {
      console.log('update-profile: username already taken');
      return res.status(400).json({ success: false, error: 'Username is already taken' });
    }

    // Update the user
    console.log('update-profile: updating user', tokenUser.id, 'with username', trimmedUsername);
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

    console.log('update-profile: update result =', updatedUser);
    return res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
