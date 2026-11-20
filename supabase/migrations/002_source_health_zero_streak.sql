-- =============================================================================
-- Migration 002: Silent-Zero Source Detection
-- Adds consecutive_zero_runs and has_ever_produced_records to source_health
-- so a source that previously produced leads and then returns 0 for 3+ runs
-- triggers a Silent-Zero warning in the daily briefing.
-- =============================================================================

alter table public.source_health
  add column if not exists consecutive_zero_runs integer not null default 0,
  add column if not exists has_ever_produced_records boolean not null default false;
