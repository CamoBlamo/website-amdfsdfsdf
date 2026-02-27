import { findOrCreateUser } from './db.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DOMAIN = 'https://devdock.cc';

export async function handleGoogleCallback(code) {
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${DOMAIN}/api/auth-google-callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) throw new Error('No access token');

    const userResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );

    const googleUser = await userResponse.json();

    const user = await findOrCreateUser('google', {
      oauth_id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      avatar: googleUser.picture,
    });

    return user;
  } catch (error) {
    console.error('Google OAuth error:', error);
    throw error;
  }
}

export async function handleDiscordCallback(code) {
  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        redirect_uri: `${DOMAIN}/api/auth-discord-callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) throw new Error('No access token');

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const discordUser = await userResponse.json();

    const user = await findOrCreateUser('discord', {
      oauth_id: discordUser.id,
      email: discordUser.email,
      name: discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null,
    });

    return user;
  } catch (error) {
    console.error('Discord OAuth error:', error);
    throw error;
  }
}

export function generateSessionToken(user) {
  const payload = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      provider: user.provider,
      role: user.role,
      subscriptionStatus: user.subscriptionStatus,
      createdAt: user.createdAt,
    },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

