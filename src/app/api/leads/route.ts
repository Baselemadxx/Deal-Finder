import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { DistressType, LeadFilters, LeadStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const minScoreRaw = sp.get('minScore');
    const limitRaw = sp.get('limit');

    const filters: LeadFilters = {
      state: sp.get('state') || undefined,
      county: sp.get('county') || undefined,
      distressType: (sp.get('distressType') as DistressType) || undefined,
      minScore: minScoreRaw ? Number(minScoreRaw) : undefined,
      status: (sp.get('status') as LeadStatus) || undefined,
      dateFrom: sp.get('dateFrom') || undefined,
      dateTo: sp.get('dateTo') || undefined,
      search: sp.get('search') || undefined,
      sortBy: (sp.get('sortBy') as LeadFilters['sortBy']) || 'motivation_score',
      sortDir: sp.get('sortDir') === 'asc' ? 'asc' : 'desc',
      limit: limitRaw ? Number(limitRaw) : undefined,
    };

    const db = getDb();
    const leads = await db.getLeads(filters);
    return NextResponse.json({ leads, total: leads.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load leads' },
      { status: 500 }
    );
  }
}
