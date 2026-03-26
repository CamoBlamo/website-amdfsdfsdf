const RATE_LIMIT_STORE = globalThis.__devdockRateLimitStore || new Map();
if (!globalThis.__devdockRateLimitStore) {
  globalThis.__devdockRateLimitStore = RATE_LIMIT_STORE;
}

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 120;

function getHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
}

function toUrl(value) {
  if (!value) return null;
  try {
    return new URL(String(value));
  } catch (_) {
    return null;
  }
}

export function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
}

export function verifySameOriginRequest(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return true;
  }

  const host = getHost(req);
  if (!host) {
    res.status(400).json({ success: false, error: 'Invalid host header' });
    return false;
  }

  const origin = toUrl(req.headers.origin);
  if (origin && origin.host.toLowerCase() !== host) {
    res.status(403).json({ success: false, error: 'Forbidden origin' });
    return false;
  }

  const referer = toUrl(req.headers.referer);
  if (referer && referer.host.toLowerCase() !== host) {
    res.status(403).json({ success: false, error: 'Forbidden referer' });
    return false;
  }

  return true;
}

function getRequesterKey(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  const remote = String(req.socket && req.socket.remoteAddress || '').trim();
  return forwardedFor || remote || 'unknown';
}

export function enforceRateLimit(req, res, options = {}) {
  const maxRequests = Number(options.maxRequests || DEFAULT_MAX_REQUESTS);
  const windowMs = Number(options.windowMs || DEFAULT_WINDOW_MS);
  const namespace = String(options.namespace || 'default');

  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = `${namespace}:${getRequesterKey(req)}:${bucket}`;
  const used = Number(RATE_LIMIT_STORE.get(key) || 0) + 1;
  RATE_LIMIT_STORE.set(key, used);

  if (RATE_LIMIT_STORE.size > 8000) {
    for (const existingKey of RATE_LIMIT_STORE.keys()) {
      if (!existingKey.includes(`:${bucket}`)) {
        RATE_LIMIT_STORE.delete(existingKey);
      }
    }
  }

  if (used > maxRequests) {
    res.status(429).json({ success: false, error: 'Too many requests' });
    return false;
  }

  return true;
}
