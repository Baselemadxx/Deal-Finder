-- =============================================================================
-- Distress Deal Finder — Initial PostgreSQL Schema (Supabase Free Tier)
-- Run in Supabase SQL Editor or via `supabase db push`
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. LEADS
-- Core property records, deduplicated by parcel_id (when available) or
-- normalized_address + county + state.
-- -----------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  parcel_id text,
  address text not null,
  normalized_address text not null,
  city text,
  county text not null,
  state text not null,
  zip text,
  owner_name text,
  mailing_address text,
  property_type text,
  assessed_value numeric(14, 2),
  tax_delinquent_amount numeric(14, 2),
  auction_date date,
  distress_types text[] not null default '{}',
  primary_distress_type text not null,
  source_url text not null,
  source_name text not null,
  sources jsonb not null default '[]'::jsonb,
  enrichment jsonb not null default '{}'::jsonb,
  motivation_score integer not null default 0,
  score_breakdown jsonb not null default '[]'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'contacted', 'under_contract', 'dead', 'sold')),
  notes text not null default '',
  skip_trace_status text not null default 'not_started'
    check (skip_trace_status in ('not_started', 'in_progress', 'completed')),
  skip_trace_notes text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_state_county on public.leads (state, county);
create index if not exists idx_leads_motivation_score on public.leads (motivation_score desc);
create index if not exists idx_leads_first_seen_at on public.leads (first_seen_at desc);
create index if not exists idx_leads_status on public.leads (status);
create index if not exists idx_leads_distress_types on public.leads using gin (distress_types);
create index if not exists idx_leads_parcel_id on public.leads (parcel_id) where parcel_id is not null;

-- -----------------------------------------------------------------------------
-- 2. LEAD HISTORY (append-only audit log — never overwrites lead history)
-- -----------------------------------------------------------------------------
create table if not exists public.lead_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'created',
      'seen_again',
      'signal_added',
      'enriched',
      'status_changed',
      'stale_flagged',
      'note_updated',
      'skip_trace_updated'
    )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_history_lead_id on public.lead_history (lead_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. SOURCE HEALTH (per-source heartbeat table shown on dashboard)
-- -----------------------------------------------------------------------------
create table if not exists public.source_health (
  source_key text primary key,
  source_id text not null,
  source_name text not null,
  state text not null,
  county text not null,
  status text not null default 'healthy'
    check (status in ('healthy', 'error', 'disabled')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_record_count integer not null default 0,
  consecutive_failures integer not null default 0,
  consecutive_zero_runs integer not null default 0,
  has_ever_produced_records boolean not null default false,
  last_error jsonb,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. SCAN RUNS (daily autonomous run audit log)
-- -----------------------------------------------------------------------------
create table if not exists public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial_failure', 'failed')),
  leads_added integer not null default 0,
  leads_updated integer not null default 0,
  duplicates_merged integer not null default 0,
  records_rejected integer not null default 0,
  stale_flagged integer not null default 0,
  high_score_alerts_sent integer not null default 0,
  email_type_sent text not null default 'none'
    check (email_type_sent in ('daily_briefing', 'error_report', 'none')),
  error_summary text,
  per_source_stats jsonb not null default '{}'::jsonb
);

create index if not exists idx_scan_runs_started_at on public.scan_runs (started_at desc);

-- -----------------------------------------------------------------------------
-- 5. REJECTED RECORDS (validation audit log — required-field check failures)
-- -----------------------------------------------------------------------------
create table if not exists public.rejected_records (
  id uuid primary key default gen_random_uuid(),
  scan_run_id uuid references public.scan_runs(id) on delete set null,
  source_id text not null,
  county text not null,
  state text not null,
  reason text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rejected_records_scan_run on public.rejected_records (scan_run_id);

-- -----------------------------------------------------------------------------
-- 6. UPDATED_AT TRIGGER
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

drop trigger if exists trg_source_health_updated_at on public.source_health;
create trigger trg_source_health_updated_at
  before update on public.source_health
  for each row execute function public.set_updated_at();
