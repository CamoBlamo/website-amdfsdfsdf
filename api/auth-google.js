const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DOMAIN = 'https://devdock.cc';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Redirect to Google OAuth
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${DOMAIN}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
    });

    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  res.status(405).json({ error: 'Method not allowed' });
}

