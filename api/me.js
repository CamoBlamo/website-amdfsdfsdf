import { prisma } from '../lib/db.js';
import { getUserFromRequest, isEmailAdmin } from '../lib/auth-utils.js';
import { applySecurityHeaders, verifySameOriginRequest, enforceRateLimit } from '../lib/api-security.js';
import { getUserDepartments } from '../lib/department-access.js';

export default async function handler(req, res) {
  try {
    applySecurityHeaders(res);
    if (!verifySameOriginRequest(req, res)) return;
    if (!enforceRateLimit(req, res, { namespace: 'api-me', maxRequests: 120, windowMs: 60 * 1000 })) return;

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

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

      const departments = await getUserDepartments(user.id);

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          avatar: user.avatar,
          provider: user.provider,
          role: isEmailAdmin(user.email) ? 'owner' : (user.role || 'user'),
          departments,
          subscriptionStatus: user.subscriptionStatus,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error('Me endpoint error:', error);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  } catch (error) {
    console.error('Me handler fatal error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}

