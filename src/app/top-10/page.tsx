import Link from 'next/link';
import { Calendar, ExternalLink, Flame, MapPin } from 'lucide-react';
import { getDb } from '@/lib/db';
import { DistressBadge, ScoreBadge, StatusBadge } from '@/components/ScoreBadge';

export const dynamic = 'force-dynamic';

export default async function Top10Page() {
  const db = getDb();
  const top10 = await db.getTop10Today();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <Flame className="h-5 w-5 text-red-600" />
            Top 10 Today
          </h1>
          <p className="text-xs text-slate-500">
            Highest motivation active leads ranked by distress stacking, urgency, tax delinquency, and absentee status.
          </p>
        </div>
        <Link
          href="/leads"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Browse All Leads
        </Link>
      </div>

      <div className="space-y-3">
        {top10.map((lead, idx) => (
          <div
            key={lead.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-slate-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="truncate text-base font-bold text-slate-900 hover:text-blue-700 hover:underline"
                  >
                    {lead.address}
                  </Link>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {lead.city ? `${lead.city}, ` : ''}
                    {lead.county} County, {lead.state}
                  </span>
                  {lead.auction_date && (
                    <span className="inline-flex items-center gap-1 font-medium text-red-700">
                      <Calendar className="h-3.5 w-3.5" />
                      Auction: {lead.auction_date}
                    </span>
                  )}
                  {lead.tax_delinquent_amount && (
                    <span className="font-medium text-amber-700">
                      Delinquent Tax: ${lead.tax_delinquent_amount.toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {lead.distress_types.map((dt) => (
                    <DistressBadge key={dt} type={dt} />
                  ))}
                  {lead.enrichment?.absenteeOwner && (
                    <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Absentee Owner
                    </span>
                  )}
                  <StatusBadge status={lead.status} />
                </div>

                {/* Mini score breakdown pills */}
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                  {lead.score_breakdown.map((b, i) => (
                    <span key={i} className="rounded bg-slate-100 px-2 py-0.5">
                      +{b.points} {b.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <ScoreBadge score={lead.motivation_score} size="lg" />
                <div className="flex items-center gap-2">
                  <a
                    href={lead.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Source
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Details
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
