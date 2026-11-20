'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, ExternalLink, Search } from 'lucide-react';
import { DISTRESS_TYPE_LABELS, DistressType, Lead } from '@/lib/types';
import { DistressBadge, ScoreBadge, StatusBadge } from './ScoreBadge';

interface Props {
  initialLeads: Lead[];
  availableStates: string[];
  availableCounties: string[];
  initialCounty?: string;
  initialState?: string;
}

type SortField = 'motivation_score' | 'first_seen_at' | 'auction_date' | 'address' | 'county';

export function LeadsTableClient({
  initialLeads,
  availableStates,
  availableCounties,
  initialCounty = '',
  initialState = '',
}: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [loading, setLoading] = useState(false);

  const [stateFilter, setStateFilter] = useState(initialState);
  const [countyFilter, setCountyFilter] = useState(initialCounty);
  const [distressFilter, setDistressFilter] = useState<DistressType | ''>('');
  const [minScore, setMinScore] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('motivation_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const controller = new AbortController();
    async function fetchFiltered() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (stateFilter) params.set('state', stateFilter);
        if (countyFilter) params.set('county', countyFilter);
        if (distressFilter) params.set('distressType', distressFilter);
        if (minScore) params.set('minScore', minScore);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        if (search.trim()) params.set('search', search.trim());
        params.set('sortBy', sortBy);
        params.set('sortDir', sortDir);

        const res = await fetch(`/api/leads?${params.toString()}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setLeads(data.leads ?? []);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error(err);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchFiltered();
    return () => controller.abort();
  }, [stateFilter, countyFilter, distressFilter, minScore, dateFrom, dateTo, search, sortBy, sortDir]);

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search address, owner, parcel..."
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="">All States</option>
            {availableStates.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            value={countyFilter}
            onChange={(e) => setCountyFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="">All Counties</option>
            {availableCounties.map((c) => (
              <option key={c} value={c}>
                {c} County
              </option>
            ))}
          </select>

          <select
            value={distressFilter}
            onChange={(e) => setDistressFilter(e.target.value as DistressType | '')}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="">All Distress Types</option>
            {Object.entries(DISTRESS_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="Min Score (e.g. 60)"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="First seen from"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="First seen to"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />

          <button
            onClick={() => {
              setStateFilter('');
              setCountyFilter('');
              setDistressFilter('');
              setMinScore('');
              setDateFrom('');
              setDateTo('');
              setSearch('');
            }}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {loading ? 'Updating...' : `Showing ${leads.length} lead${leads.length === 1 ? '' : 's'}`}
        </span>
        <div className="flex items-center gap-2 md:hidden">
          <span>Sort:</span>
          <select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split(':') as [SortField, 'asc' | 'desc'];
              setSortBy(f);
              setSortDir(d);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="motivation_score:desc">Score (High to Low)</option>
            <option value="first_seen_at:desc">Newest First</option>
            <option value="auction_date:asc">Auction Soonest</option>
            <option value="county:asc">County (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-3 md:hidden">
        {leads.map((lead) => (
          <div key={lead.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/leads/${lead.id}`} className="text-sm font-bold text-slate-900 hover:underline">
                  {lead.address}
                </Link>
                <div className="text-xs text-slate-500">
                  {lead.county}, {lead.state} &bull; First seen {lead.first_seen_at.slice(0, 10)}
                </div>
              </div>
              <ScoreBadge score={lead.motivation_score} size="sm" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lead.distress_types.map((dt) => (
                <DistressBadge key={dt} type={dt} />
              ))}
              <StatusBadge status={lead.status} />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
              <a
                href={lead.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-600"
              >
                Public Source <ExternalLink className="h-3 w-3" />
              </a>
              <Link href={`/leads/${lead.id}`} className="font-semibold text-slate-900">
                Open Detail &rarr;
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Sortable Table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">
                  <button onClick={() => toggleSort('motivation_score')} className="inline-flex items-center gap-1">
                    Score <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button onClick={() => toggleSort('address')} className="inline-flex items-center gap-1">
                    Property <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button onClick={() => toggleSort('county')} className="inline-flex items-center gap-1">
                    County <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3">Distress Signals</th>
                <th className="px-4 py-3">
                  <button onClick={() => toggleSort('auction_date')} className="inline-flex items-center gap-1">
                    Auction <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button onClick={() => toggleSort('first_seen_at')} className="inline-flex items-center gap-1">
                    First Seen <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <ScoreBadge score={lead.motivation_score} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                    >
                      {lead.address}
                    </Link>
                    {lead.owner_name && (
                      <div className="text-xs text-slate-500">{lead.owner_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-700">
                    {lead.county}, {lead.state}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.distress_types.map((dt) => (
                        <DistressBadge key={dt} type={dt} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">{lead.auction_date ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{lead.first_seen_at.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <a
                        href={lead.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Source
                      </a>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                    No leads match your current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
