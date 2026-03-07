import { handleGoogleCallback, generateSessionToken } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/login.html?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const user = await handleGoogleCallback(code);
    const token = generateSessionToken(user);

    const host = String(req.headers.host || '');
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '');
    const isSecureRequest = forwardedProto.includes('https') || host.includes('devdock.cc');
    const secureAttr = isSecureRequest ? '; Secure' : '';

    res.setHeader('Set-Cookie', `auth_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secureAttr}`);

    return res.redirect(`/developerspaces.html?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error('Google callback error:', error);
    return res.redirect(`/login.html?error=${encodeURIComponent(error.message)}`);
  }
}

