const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DOMAIN = 'https://devdock.cc';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Redirect to Google OAuth
    const redirectUri = `${DOMAIN}/api/auth-google-callback`;
    const scope = 'openid email profile';
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;

    return res.redirect(authUrl);
  }

  res.status(405).json({ error: 'Method not allowed' });
}

