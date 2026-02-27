// Simple JWT encoding/decoding for client-side (legacy, unused in new flow)

export function encodeJWT(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = generateSignature(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (e) {
    return null;
  }
}

async function generateSignature(message, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export function saveToken(token) {
  localStorage.setItem('auth_token', token);
}

export function getToken() {
  return localStorage.getItem('auth_token');
}

export function clearToken() {
  localStorage.removeItem('auth_token');
}

export function isAuthenticated() {
  const token = getToken();
  if (!token) return false;

  const payload = decodeJWT(token);
  if (!payload) return false;

  if (payload.exp && Date.now() > payload.exp * 1000) {
    clearToken();
    return false;
  }

  return true;
}

export function getUserFromToken() {
  const token = getToken();
  if (!token) return null;

  const payload = decodeJWT(token);
  return payload?.user || null;
}

