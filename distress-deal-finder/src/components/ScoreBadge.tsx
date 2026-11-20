import { DISTRESS_TYPE_LABELS, DistressType, LeadStatus } from '@/lib/types';

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color =
    score >= 75
      ? 'bg-red-600 text-white ring-red-200'
      : score >= 55
        ? 'bg-amber-500 text-white ring-amber-200'
        : 'bg-slate-700 text-white ring-slate-200';

  const sizing =
    size === 'lg'
      ? 'px-3 py-1.5 text-base font-bold'
      : size === 'sm'
        ? 'px-2 py-0.5 text-xs font-bold'
        : 'px-2.5 py-1 text-sm font-bold';

  return (
    <span className={`inline-flex items-center rounded-full ring-2 ${color} ${sizing}`}>
      {score}
      <span className="ml-0.5 text-[10px] font-medium opacity-80">/100</span>
    </span>
  );
}

const SIGNAL_COLORS: Record<DistressType, string> = {
  pre_foreclosure: 'bg-red-50 text-red-700 border-red-200',
  foreclosure_auction: 'bg-rose-100 text-rose-800 border-rose-300',
  tax_sale: 'bg-orange-50 text-orange-800 border-orange-200',
  tax_delinquent: 'bg-amber-50 text-amber-800 border-amber-200',
  lis_pendens: 'bg-purple-50 text-purple-800 border-purple-200',
  tax_deed: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  gov_reo: 'bg-blue-50 text-blue-700 border-blue-200',
  stale_120_plus: 'bg-slate-100 text-slate-700 border-slate-300',
};

export function DistressBadge({ type }: { type: DistressType }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
        SIGNAL_COLORS[type] ?? 'bg-slate-100 text-slate-700 border-slate-200'
      }`}
    >
      {DISTRESS_TYPE_LABELS[type] ?? type}
    </span>
  );
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  contacted: 'bg-sky-50 text-sky-700 border-sky-200',
  under_contract: 'bg-violet-50 text-violet-700 border-violet-200',
  dead: 'bg-slate-100 text-slate-500 border-slate-200',
  sold: 'bg-slate-200 text-slate-700 border-slate-300',
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status]
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
