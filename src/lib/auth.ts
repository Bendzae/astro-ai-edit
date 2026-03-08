const AUTH_SECRET = import.meta.env.AUTH_SECRET || 'dev-secret-change-me';
const ADMIN_USERNAME = import.meta.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = import.meta.env.ADMIN_PASSWORD;
const COOKIE_NAME = 'admin_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

async function hmacSign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacVerify(payload: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(payload);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

export function isConfigured(): boolean {
  return !!(ADMIN_USERNAME && ADMIN_PASSWORD);
}

export function validateCredentials(username: string, password: string): boolean {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return false;

  // Constant-time comparison for both
  const userMatch = username.length === ADMIN_USERNAME.length &&
    [...username].reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ ADMIN_USERNAME.charCodeAt(i)), 0) === 0;
  const passMatch = password.length === ADMIN_PASSWORD.length &&
    [...password].reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ ADMIN_PASSWORD.charCodeAt(i)), 0) === 0;

  return userMatch && passMatch;
}

export async function createSessionCookie(): Promise<string> {
  const expires = Date.now() + SESSION_DURATION_MS;
  const payload = `admin:${expires}`;
  const sig = await hmacSign(payload);
  const value = btoa(`${payload}:${sig}`);

  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}`;
}

export async function verifySession(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;

  const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return false;

  const value = match.split('=').slice(1).join('=');
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    return false;
  }

  const parts = decoded.split(':');
  if (parts.length !== 3) return false;

  const [role, expiresStr, sig] = parts;
  const payload = `${role}:${expiresStr}`;

  if (role !== 'admin') return false;

  const expires = Number(expiresStr);
  if (isNaN(expires) || Date.now() > expires) return false;

  return hmacVerify(payload, sig);
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
