const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DOMAIN = 'https://devdock.cc';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Redirect to Discord OAuth
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: `${DOMAIN}/api/auth-discord-callback`,
      response_type: 'code',
      scope: 'identify email',
    });

    return res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  }

  res.status(405).json({ error: 'Method not allowed' });
}

