const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DOMAIN = 'https://devdock.cc';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Redirect to Discord OAuth
    const redirectUri = `${DOMAIN}/api/auth-discord-callback`;
    const scope = 'identify email';
    
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(DISCORD_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;

    return res.redirect(authUrl);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
  }

  res.status(405).json({ error: 'Method not allowed' });
}

