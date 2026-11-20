import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const sources = await db.getSourceHealth();
    const errored = sources.filter((s) => s.status === 'error');
    return NextResponse.json({
      ok: errored.length === 0,
      healthySources: sources.filter((s) => s.status === 'healthy').length,
      erroredSources: errored.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Health check failed' },
      { status: 500 }
    );
  }
}
