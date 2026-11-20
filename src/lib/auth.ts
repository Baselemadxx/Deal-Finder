export const SESSION_COOKIE_NAME = 'ddf_session';

export function getDashboardToken(): string {
  return process.env.DASHBOARD_TOKEN?.trim() ?? '';
}

export function isAuthEnforced(): boolean {
  return Boolean(getDashboardToken()) || process.env.NODE_ENV === 'production';
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function deriveSessionToken(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('ddf-session-v1'));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isAuthorizedRequest(input: {
  cookieValue?: string | null;
  authHeader?: string | null;
  secret?: string;
}): Promise<boolean> {
  const secret = (input.secret ?? getDashboardToken()).trim();
  if (!secret) {
    // Fail closed in production; only allow unauthenticated access in local dev when no token is configured.
    return process.env.NODE_ENV !== 'production';
  }

  if (input.authHeader && input.authHeader.startsWith('Bearer ')) {
    const bearer = input.authHeader.slice(7).trim();
    if (constantTimeEqual(bearer, secret)) {
      return true;
    }
  }

  if (input.cookieValue) {
    const expected = await deriveSessionToken(secret);
    if (constantTimeEqual(input.cookieValue, expected)) {
      return true;
    }
  }

  return false;
}
