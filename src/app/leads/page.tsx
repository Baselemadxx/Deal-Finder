import { getAllCounties } from '@/lib/config';
import { getDb } from '@/lib/db';
import { LeadsTableClient } from '@/components/LeadsTableClient';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ county?: string; state?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const initialLeads = await db.getLeads({
    county: sp.county || undefined,
    state: sp.state || undefined,
    sortBy: 'motivation_score',
    sortDir: 'desc',
  });

  const allCounties = getAllCounties();
  const availableStates = Array.from(new Set(allCounties.map((c) => c.state)));
  const availableCounties = Array.from(new Set(allCounties.map((c) => c.county)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">All Distressed Leads</h1>
        <p className="text-xs text-slate-500">
          Filter by state, county, distress signal, motivation score, or date range. Every record links directly to its public source.
        </p>
      </div>
      <LeadsTableClient
        initialLeads={initialLeads}
        availableStates={availableStates}
        availableCounties={availableCounties}
        initialCounty={sp.county || ''}
        initialState={sp.state || ''}
      />
    </div>
  );
}
