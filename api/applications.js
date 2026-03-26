import { handleApplicationSubmission } from '../application-handler.js';
import { applySecurityHeaders, verifySameOriginRequest, enforceRateLimit } from '../lib/api-security.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  if (!verifySameOriginRequest(req, res)) return;
  if (!enforceRateLimit(req, res, { namespace: 'api-applications', maxRequests: 25, windowMs: 60 * 1000 })) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Missing request body' });
    }

    const { applicationType, discordUsername, devdockUsername, email, responses } = req.body;

    if (!applicationType || !discordUsername || !devdockUsername || !email || !responses) {
      return res.status(400).json({ error: 'applicationType, discordUsername, devdockUsername, email, and responses are required' });
    }

    const app = await handleApplicationSubmission(req.body);
    return res.status(201).json({ success: true, applicationId: app.id });
  } catch (error) {
    console.error('api/applications error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
