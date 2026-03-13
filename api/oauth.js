import {
  handleGoogleCallback,
  handleDiscordCallback,
  generateSessionToken,
} from '../lib/auth.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const FALLBACK_DOMAIN = 'https://devdock.cc';

function resolveSiteOrigin(req) {
  const configuredOrigin = String(process.env.SITE_URL || process.env.NEXTAUTH_URL || '').trim();
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch (_) {
      // Fall through to request-derived origin.
    }
  }

  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req.headers.host || '').trim();
  if (!host) return FALLBACK_DOMAIN;

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || (host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function getProvider(req) {
  const value = String((req.query && req.query.provider) || '').toLowerCase().trim();
  if (value === 'google' || value === 'discord') return value;
  return '';
}

function getPhase(req) {
  const value = String((req.query && req.query.phase) || 'start').toLowerCase().trim();
  return value === 'callback' ? 'callback' : 'start';
}

function redirectUriFor(provider, req) {
  const origin = resolveSiteOrigin(req);
  if (provider === 'google') return `${origin}/api/auth-google-callback`;
  return `${origin}/api/auth-discord-callback`;
}

function authUrlFor(provider, req) {
  if (provider === 'google') {
    const redirectUri = redirectUriFor('google', req);
    const scope = 'openid email profile';
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
  }

  const redirectUri = redirectUriFor('discord', req);
  const scope = 'identify email';
  return `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(DISCORD_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
}

async function handleCallback(provider, req, res) {
  const { code, error } = req.query || {};

  if (error) {
    return res.redirect(`/login.html?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  const redirectUri = redirectUriFor(provider, req);
  const user = provider === 'google'
    ? await handleGoogleCallback(code, redirectUri)
    : await handleDiscordCallback(code, redirectUri);

  const token = generateSessionToken(user);

  const host = String(req.headers.host || '');
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '');
  const isSecureRequest = forwardedProto.includes('https') || resolveSiteOrigin(req).startsWith('https://') || host.includes('devdock.cc');
  const secureAttr = isSecureRequest ? '; Secure' : '';

  res.setHeader('Set-Cookie', `auth_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secureAttr}`);

  return res.redirect(`/developerspaces.html?token=${encodeURIComponent(token)}`);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const provider = getProvider(req);
    if (!provider) {
      return res.status(400).json({ error: 'Missing or invalid provider' });
    }

    const phase = getPhase(req);
    if (phase === 'callback') {
      return await handleCallback(provider, req, res);
    }

    return res.redirect(authUrlFor(provider, req));
  } catch (error) {
    const provider = getProvider(req) || 'oauth';
    console.error(`${provider} oauth error:`, error);

    if (getPhase(req) === 'callback') {
      return res.redirect(`/login.html?error=${encodeURIComponent(error.message)}`);
    }

    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}