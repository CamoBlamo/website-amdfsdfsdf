import { prisma } from '../../../lib/db.js';
import { getUserFromRequest } from '../../../lib/auth-utils.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, errors: ['Method not allowed'] });
    }

    const tokenUser = getUserFromRequest(req);
    if (!tokenUser) {
      return res.status(200).json({ success: true, ignored: true });
    }

    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ success: false, errors: ['Missing announcement id'] });
    }

    try {
      await prisma.announcementSeen.upsert({
        where: {
          announcementId_userId: {
            announcementId: String(id),
            userId: tokenUser.id,
          },
        },
        update: {},
        create: {
          announcementId: String(id),
          userId: tokenUser.id,
        },
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Announcement seen error:', error);
      return res.status(500).json({ success: false, errors: ['Server error'] });
    }
  } catch (error) {
    console.error('Announcement seen handler fatal error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
}
