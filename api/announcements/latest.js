import { prisma } from '../../lib/db.js';
import { getUserFromRequest } from '../../lib/auth-utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, errors: ['Method not allowed'] });
  }

  try {
    const latest = await prisma.announcement.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      return res.status(200).json({ success: true, announcement: null, seen: false });
    }

    const tokenUser = getUserFromRequest(req);
    let seen = false;

    if (tokenUser) {
      const existing = await prisma.announcementSeen.findUnique({
        where: {
          announcementId_userId: {
            announcementId: latest.id,
            userId: tokenUser.id,
          },
        },
      });
      seen = !!existing;
    }

    return res.status(200).json({
      success: true,
      announcement: latest,
      seen,
      loggedIn: !!tokenUser,
    });
  } catch (error) {
    console.error('Latest announcement error:', error);
    return res.status(500).json({ success: false, errors: ['Server error'] });
  }
}
