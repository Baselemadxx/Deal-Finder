'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Home,
  PhoneOff,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { Lead, LeadHistoryEvent, LeadStatus, SkipTraceStatus } from '@/lib/types';
import { DistressBadge, ScoreBadge, StatusBadge } from './ScoreBadge';

export function LeadDetailClient({
  initialLead,
  initialHistory,
}: {
  initialLead: Lead;
  initialHistory: LeadHistoryEvent[];
}) {
  const [lead, setLead] = useState<Lead>(initialLead);
  const [history, setHistory] = useState<LeadHistoryEvent[]>(initialHistory);

  const [status, setStatus] = useState<LeadStatus>(initialLead.status);
  const [notes, setNotes] = useState(initialLead.notes);
  const [skipTraceStatus, setSkipTraceStatus] = useState<SkipTraceStatus>(initialLead.skip_trace_status);
  const [skipTraceNotes, setSkipTraceNotes] = useState(initialLead.skip_trace_notes);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSavedBanner(false);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          notes,
          skip_trace_status: skipTraceStatus,
          skip_trace_notes: skipTraceNotes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLead(data.lead);
        setHistory(data.history);
        setSavedBanner(true);
        setTimeout(() => setSavedBanner(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to All Leads
      </Link>

      {/* Header Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{lead.address}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {lead.city ? `${lead.city}, ` : ''}
              {lead.county} County, {lead.state} {lead.zip ?? ''}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {lead.distress_types.map((dt) => (
                <DistressBadge key={dt} type={dt} />
              ))}
              <StatusBadge status={lead.status} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ScoreBadge score={lead.motivation_score} size="lg" />
            <a
              href={lead.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Open Public Record
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left 2 Columns */}
        <div className="space-y-5 lg:col-span-2">
          {/* Transparent Motivation Score Breakdown */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h2 className="mb-3 text-base font-bold text-slate-900">Motivation Score Breakdown</h2>
            <div className="divide-y divide-slate-100">
              {lead.score_breakdown.map((item, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <div className="font-semibold text-slate-900">{item.label}</div>
                    <div className="text-xs text-slate-500">{item.reason}</div>
                  </div>
                  <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                    +{item.points}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Property & Assessor Enrichment */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Home className="h-4 w-4 text-slate-500" />
                Property &amp; Assessor Enrichment
              </h2>
              {lead.enrichment?.parcelUrl && (
                <a
                  href={lead.enrichment.parcelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                >
                  Open qPublic Parcel <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Owner of Record</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{lead.owner_name ?? 'Not yet enriched'}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Mailing Address</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {lead.mailing_address ?? 'Not yet enriched'}
                  {lead.enrichment?.absenteeOwner && (
                    <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">
                      ABSENTEE
                    </span>
                  )}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Parcel ID</dt>
                <dd className="mt-0.5 font-mono text-xs font-semibold text-slate-900">
                  {lead.parcel_id ?? 'Unavailable'}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Assessed / Market Value</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {lead.assessed_value ? `$${lead.assessed_value.toLocaleString()}` : '—'}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Delinquent Taxes</dt>
                <dd className="mt-0.5 font-semibold text-amber-700">
                  {lead.tax_delinquent_amount ? `$${lead.tax_delinquent_amount.toLocaleString()}` : '—'}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Auction Date</dt>
                <dd className="mt-0.5 flex items-center gap-1 font-semibold text-red-700">
                  <Calendar className="h-3.5 w-3.5" />
                  {lead.auction_date ?? 'None scheduled'}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                <dt className="text-xs text-slate-500">Property Specs</dt>
                <dd className="mt-0.5 text-xs font-medium text-slate-800">
                  {[
                    lead.property_type,
                    lead.enrichment?.yearBuilt ? `Built ${lead.enrichment.yearBuilt}` : null,
                    lead.enrichment?.sqft ? `${lead.enrichment.sqft.toLocaleString()} sqft` : null,
                    lead.enrichment?.beds ? `${lead.enrichment.beds} bd` : null,
                    lead.enrichment?.baths ? `${lead.enrichment.baths} ba` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ') || 'Pending county assessor enrichment'}
                </dd>
              </div>
            </dl>
          </section>

          {/* Manual Skip Trace Section (Honest — Never Faked) */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-2xs">
            <div className="mb-2 flex items-center gap-2">
              <PhoneOff className="h-4 w-4 text-amber-700" />
              <h2 className="text-base font-bold text-slate-900">Manual Skip Trace</h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                Manual Workflow Only
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-600">
              There is no reliable free API for owner phone numbers. Never rely on fabricated numbers &mdash; record
              verified contact details you find manually (TruePeopleSearch, FastPeopleSearch, county probate, or GA
              Secretary of State eCorp for LLCs).
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Skip Trace Status</label>
                <select
                  value={skipTraceStatus}
                  onChange={(e) => setSkipTraceStatus(e.target.value as SkipTraceStatus)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none sm:w-64"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Manual Skip Trace Findings (Phones, Emails, Heirs, LLC Registered Agent)
                </label>
                <textarea
                  rows={3}
                  value={skipTraceNotes}
                  onChange={(e) => setSkipTraceNotes(e.target.value)}
                  placeholder="Enter verified phone numbers, mailing updates, or LLC registered agent details you looked up..."
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Wholesaler Notes & Pipeline Status */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
              <FileText className="h-4 w-4 text-slate-500" />
              Deal Notes &amp; Pipeline Status
            </h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Lead Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as LeadStatus)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none sm:w-64"
                >
                  <option value="active">Active</option>
                  <option value="contacted">Contacted</option>
                  <option value="under_contract">Under Contract</option>
                  <option value="dead">Dead</option>
                  <option value="sold">Sold</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Wholesaler Notes</label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Drive-by observations, repair estimates, ARV comps, seller conversation notes..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                {savedBanner && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <Check className="h-4 w-4" /> Saved to database
                  </span>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Source Links + Immutable History */}
        <div className="space-y-5">
          {/* Verified Public Source Links */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
              <ShieldAlert className="h-4 w-4 text-slate-500" />
              Verified Source Links
            </h2>
            <div className="space-y-2.5">
              {lead.sources.map((src, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div className="font-bold text-slate-900">{src.sourceName}</div>
                  <div className="mt-0.5 text-slate-500">
                    First seen: {src.firstSeenAt.slice(0, 10)} &bull; Last seen: {src.lastSeenAt.slice(0, 10)}
                  </div>
                  <a
                    href={src.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                  >
                    Open exact record <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </section>

          {/* Immutable Lead History Timeline */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
              <Clock className="h-4 w-4 text-slate-500" />
              Lead History
            </h2>
            <div className="mb-3 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
              <div>
                <strong>First Seen:</strong> {lead.first_seen_at.slice(0, 16).replace('T', ' ')} UTC
              </div>
              <div>
                <strong>Last Seen:</strong> {lead.last_seen_at.slice(0, 16).replace('T', ' ')} UTC
              </div>
            </div>
            <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4">
              {history.map((ev) => (
                <li key={ev.id} className="text-xs">
                  <div className="font-bold capitalize text-slate-900">
                    {ev.event_type.replace(/_/g, ' ')}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {ev.created_at.slice(0, 16).replace('T', ' ')} UTC
                  </div>
                  {Object.keys(ev.details).length > 0 && (
                    <div className="mt-1 rounded bg-slate-50 p-1.5 font-mono text-[10px] text-slate-600 break-all">
                      {Object.entries(ev.details)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(' | ')}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
