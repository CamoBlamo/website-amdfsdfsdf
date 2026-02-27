export function decodeToken(token) {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString());
  } catch (e) {
    return null;
  }
}

export function getTokenFromRequest(req) {
  const cookieHeader = req.headers.cookie || '';
  const tokenMatch = cookieHeader.match(/auth_token=([^;]+)/);
  if (tokenMatch) return tokenMatch[1];

  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
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

