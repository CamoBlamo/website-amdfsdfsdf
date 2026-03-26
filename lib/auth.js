import { findOrCreateUser } from './db.js';
import { createSessionToken } from './session-token.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SITE_ORIGIN = process.env.SITE_URL || process.env.NEXTAUTH_URL || 'https://devdock.cc';

function defaultRedirectUri() {
  return `${SITE_ORIGIN}/api/auth-google-callback`;
}

export async function handleGoogleCallback(code, redirectUri = defaultRedirectUri()) {
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
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

export function generateSessionToken(user) {
  return createSessionToken(user);
}

