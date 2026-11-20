import { NextRequest, NextResponse } from 'next/server';
import {
  constantTimeEqual,
  deriveSessionToken,
  getDashboardToken,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  const secret = getDashboardToken();
  if (!secret) {
    return NextResponse.json(
      { error: 'DASHBOARD_TOKEN is not configured on the server.' },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const submitted = typeof body.token === 'string' ? body.token.trim() : '';

  if (!submitted || !constantTimeEqual(submitted, secret)) {
    return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
  }

  const sessionValue = await deriveSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, sessionValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
