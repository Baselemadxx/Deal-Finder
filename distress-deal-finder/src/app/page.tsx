import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flame,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { getDb } from '@/lib/db';
import { DISTRESS_TYPE_LABELS, DistressType } from '@/lib/types';
import { DistressBadge, ScoreBadge } from '@/components/ScoreBadge';

export const dynamic = 'force-dynamic';

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default async function DashboardPage() {
  const db = getDb();
  const summary = await db.getDashboardSummary();

  const healthyCount = summary.sourceHealth.filter((s) => s.status === 'healthy').length;
  const errorCount = summary.sourceHealth.filter((s) => s.status === 'error').length;
  const maxDistressCount = Math.max(1, ...Object.values(summary.byDistressType));
  const maxCountyCount = Math.max(1, ...summary.byCounty.map((c) => c.count));

  return (
    <div className="space-y-6">
      {/* Demo Mode Banner */}
      {summary.demoMode && (
        <div className="flex flex-col justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 sm:flex-row sm:items-center">
          <div>
            <strong>Demo Mode Active:</strong> Showing seeded Metro Atlanta public-record leads from{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5">.data/local-db.json</code>. Connect Supabase and set{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5">DEMO_MODE=false</code> for live production scans.
          </div>
        </div>
      )}

      {/* Source Error Alert Banner */}
      {errorCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <div className="font-bold">
              {errorCount} data source{errorCount === 1 ? '' : 's'} reported an error on the last scan
            </div>
            <div className="text-xs text-red-800">
              Inspect the red source cards below for the exact error and last successful run timestamp.
            </div>
          </div>
        </div>
      )}

      {/* KPI Grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>New Today</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{summary.newToday}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">Verified &amp; deduplicated</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Active</span>
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{summary.totalActive}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{summary.totalLeads} total tracked</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Hot Leads (70+)</span>
            <Flame className="h-4 w-4 text-red-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-red-600">{summary.highScoreCount}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">Immediate alert tier</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Stale 120+ Days</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{summary.stale120Count}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">Auto-flagged from first seen</div>
        </div>
      </section>

      {/* Top 5 Quick Preview + Link to Top 10 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Top Motivated Leads Today</h2>
            <p className="text-xs text-slate-500">Ranked by transparent motivation score</p>
          </div>
          <Link
            href="/top-10"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            View Top 10
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {summary.top10.slice(0, 5).map((lead, idx) => (
            <Link
              key={lead.id}
              href={`/leads/${lead.id}`}
              className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50 -mx-2 px-2 rounded-lg"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                  <span className="truncate text-sm font-semibold text-slate-900">{lead.address}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500">
                    {lead.county}, {lead.state}
                  </span>
                  {lead.distress_types.map((dt) => (
                    <DistressBadge key={dt} type={dt} />
                  ))}
                </div>
              </div>
              <ScoreBadge score={lead.motivation_score} size="sm" />
            </Link>
          ))}
        </div>
      </section>

      {/* Breakdown Grid: By Distress Type & By County */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
          <h2 className="mb-3 text-base font-bold text-slate-900">Active Leads by Distress Type</h2>
          <div className="space-y-3">
            {Object.entries(summary.byDistressType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">
                      {DISTRESS_TYPE_LABELS[type as DistressType] ?? type}
                    </span>
                    <span className="font-bold text-slate-900">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-900"
                      style={{ width: `${Math.round((count / maxDistressCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
          <h2 className="mb-3 flex items-center gap-1.5 text-base font-bold text-slate-900">
            <MapPin className="h-4 w-4 text-slate-500" />
            Active Leads by County
          </h2>
          <div className="space-y-3">
            {summary.byCounty.map((item) => (
              <div key={`${item.state}-${item.county}`}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <Link
                    href={`/leads?county=${encodeURIComponent(item.county)}&state=${encodeURIComponent(item.state)}`}
                    className="font-medium text-slate-700 hover:underline"
                  >
                    {item.county} County, {item.state}
                  </Link>
                  <span className="font-bold text-slate-900">{item.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.round((item.count / maxCountyCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Source Health Heartbeat Panel */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Source Health Heartbeat</h2>
            <p className="text-xs text-slate-500">
              Zero-silent-failure monitor &mdash; green means verified healthy, red triggers an immediate error email.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {healthyCount} Healthy
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 border ${
                errorCount > 0
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {errorCount} Error
            </span>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {summary.sourceHealth.map((src) => {
            const isHealthy = src.status === 'healthy';
            return (
              <div
                key={src.source_key}
                className={`rounded-xl border p-3 ${
                  isHealthy
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-red-300 bg-red-50/70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-slate-900">{src.source_name}</div>
                    <div className="text-[11px] text-slate-600">
                      {src.county}, {src.state}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      isHealthy ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {isHealthy ? 'Green' : 'Red'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Last OK: {formatRelativeTime(src.last_success_at)}</span>
                  <span>{src.last_record_count} recs</span>
                </div>
                {src.last_error && (
                  <div className="mt-2 rounded-md bg-red-100 p-1.5 text-[11px] text-red-900">
                    {src.last_error.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent Autonomous Runs */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
        <h2 className="mb-3 text-base font-bold text-slate-900">Recent Autonomous Scan Runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">Date (UTC)</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Added</th>
                <th className="py-2 pr-3">Merged</th>
                <th className="py-2 pr-3">Rejected</th>
                <th className="py-2">Email Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className="py-2 pr-3 font-medium text-slate-700">
                    {run.started_at.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        run.status === 'success'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {run.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-slate-900">{run.leads_added}</td>
                  <td className="py-2 pr-3 text-slate-600">{run.duplicates_merged}</td>
                  <td className="py-2 pr-3 text-slate-600">{run.records_rejected}</td>
                  <td className="py-2 capitalize text-slate-700">
                    {run.email_type_sent.replace('_', ' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
