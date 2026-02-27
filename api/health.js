import { prisma } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    // Test database connection
    const user = await prisma.user.count();
    
    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      userCount: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

