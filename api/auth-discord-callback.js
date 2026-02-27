import { handleDiscordCallback, generateSessionToken } from '../lib/auth.js';

export default async function handler(req, res) {
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

  try {
    const user = await handleDiscordCallback(code);
    const token = generateSessionToken(user);

    res.setHeader('Set-Cookie', `auth_token=${token}; Path=/; Secure; SameSite=Lax`);

    return res.redirect(`/developerspaces.html?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error('Discord callback error:', error);
    return res.redirect(`/login.html?error=${encodeURIComponent(error.message)}`);
  }
}
