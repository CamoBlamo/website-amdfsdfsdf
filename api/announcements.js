import { prisma } from '../lib/db.js';
import { getUserFromRequest } from '../lib/auth-utils.js';

function getMode(req) {
  return String((req.query && req.query.mode) || '').toLowerCase().trim();
}

async function handleLatest(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, errors: ['Method not allowed'] });
  }

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
}

async function handleSeen(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, errors: ['Method not allowed'] });
  }

  const tokenUser = getUserFromRequest(req);
  if (!tokenUser) {
    return res.status(200).json({ success: true, ignored: true });
  }

  const id = String((req.query && req.query.id) || '').trim();
  if (!id) {
    return res.status(400).json({ success: false, errors: ['Missing announcement id'] });
  }

  await prisma.announcementSeen.upsert({
    where: {
      announcementId_userId: {
        announcementId: id,
        userId: tokenUser.id,
      },
    },
    update: {},
    create: {
      announcementId: id,
      userId: tokenUser.id,
    },
  });

  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  try {
    const mode = getMode(req);

    if (mode === 'latest') {
      return await handleLatest(req, res);
    }

    if (mode === 'seen') {
      return await handleSeen(req, res);
    }

    return res.status(400).json({
      success: false,
      errors: ['mode query parameter is required (latest or seen)'],
    });
  } catch (error) {
    console.error('announcements handler error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
}