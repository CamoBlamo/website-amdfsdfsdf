import { prisma } from '../lib/db.js';
import { applySecurityHeaders, enforceRateLimit } from '../lib/api-security.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  try {
    applySecurityHeaders(res);
    if (!enforceRateLimit(req, res, { namespace: 'api-health', maxRequests: 30, windowMs: 60 * 1000 })) return;

    if (req.method !== 'GET') {
      return res.status(405).json({ status: 'error', error: 'Method not allowed' });
    }

    try {
      // Test database connection
      await prisma.user.count();
    } catch (dbError) {
      return res.status(503).json({
        status: 'error',
        database: 'disconnected',
        error: dbError.message,
        timestamp: new Date().toISOString(),
      });
    }
    
    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        status: 'error',
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

