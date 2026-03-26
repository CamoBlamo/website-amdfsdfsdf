import crypto from 'crypto';

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const HEADER = { alg: 'HS256', typ: 'JWT' };

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  const padded = remainder ? `${normalized}${'='.repeat(4 - remainder)}` : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseBase64UrlJson(input) {
  return JSON.parse(base64UrlDecode(input));
}

function getSessionSecret() {
  const secret = String(
    process.env.SESSION_TOKEN_SECRET
    || process.env.AUTH_SECRET
    || process.env.JWT_SECRET
    || ''
  ).trim();

  if (secret) return secret;

  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Missing SESSION_TOKEN_SECRET (or AUTH_SECRET/JWT_SECRET)');
  }

  return 'devdock-dev-secret-change-me';
}

function signPayload(headerB64, payloadB64, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

export function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000);
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
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const secret = getSessionSecret();
  const headerB64 = base64UrlEncode(JSON.stringify(HEADER));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(headerB64, payloadB64, secret);
  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifySessionToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return null;

  const parts = normalized.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  if (!headerB64 || !payloadB64 || !signature) return null;

  const header = safeJsonParse(base64UrlDecode(headerB64));
  if (!header || header.alg !== 'HS256') return null;

  const secret = getSessionSecret();
  const expectedSignature = signPayload(headerB64, payloadB64, secret);

  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (signatureBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(signatureBuf, expectedBuf)) return null;

  const payload = parseBase64UrlJson(payloadB64);
  if (!payload || typeof payload !== 'object' || !payload.user) return null;

  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
    return null;
  }

  return payload;
}
