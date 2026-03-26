import { verifySessionToken } from './session-token.js';

function normalizeTokenValue(rawToken) {
  if (!rawToken) return null;

  const trimmed = String(rawToken).trim().replace(/^"|"$/g, '');
  if (!trimmed) return null;

  try {
    return decodeURIComponent(trimmed);
  } catch (_) {
    return trimmed;
  }
}

export function decodeToken(token) {
  try {
    const normalizedToken = normalizeTokenValue(token);
    if (!normalizedToken) return null;

    // Only accept verified signed session tokens.
    return verifySessionToken(normalizedToken);
  } catch (e) {
    return null;
  }
}

export function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearerToken = normalizeTokenValue(authHeader.slice(7));
    if (bearerToken) return bearerToken;
  }

  const cookieHeader = req.headers.cookie || '';
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (tokenMatch) {
    return normalizeTokenValue(tokenMatch[1]);
  }

  return null;
}

export function getUserFromRequest(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  const decoded = decodeToken(token);
  if (!decoded || !decoded.user) return null;

  if (decoded.exp && Date.now() > decoded.exp * 1000) {
    return null;
  }

  return decoded.user;
}

export function isEmailAdmin(email) {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return email ? list.includes(email.toLowerCase()) : false;
}

