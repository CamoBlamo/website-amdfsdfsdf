import { prisma } from '../lib/db.js';
import { applySecurityHeaders, enforceRateLimit } from '../lib/api-security.js';

export default async function handler(req, res) {
  try {
    applySecurityHeaders(res);
    if (!enforceRateLimit(req, res, { namespace: 'api-health', maxRequests: 30, windowMs: 60 * 1000 })) return;

    if (req.method !== 'GET') {
      return res.status(405).json({ status: 'error', error: 'Method not allowed' });
    }

    // Test database connection
    await prisma.user.count();
    
    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
}

