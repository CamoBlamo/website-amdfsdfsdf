import { prisma } from '../lib/db.js';
import { getUserFromRequest, isEmailAdmin } from '../lib/auth-utils.js';

export default async function handler(req, res) {
  const tokenUser = getUserFromRequest(req);
  if (!tokenUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: tokenUser.id },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const role = isEmailAdmin(user.email) ? 'owner' : user.role || 'user';

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        avatar: user.avatar,
        provider: user.provider,
        role: role,
        subscriptionStatus: user.subscriptionStatus,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Me endpoint error:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
