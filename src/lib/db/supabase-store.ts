import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { calculateMotivationScore, isEligibleForStale120 } from '../scoring';
import {
  DashboardSummary,
  Lead,
  LeadFilters,
  LeadHistoryEvent,
  LeadHistoryEventType,
  LeadStatus,
  PerSourceRunStat,
  ScanRun,
  SkipTraceStatus,
  SourceHealth,
  StructuredErrorInfo,
} from '../types';
import { ValidatedLeadCandidate } from '../validation';
import { DatabaseClient, UpsertLeadOutcome } from './interface';

export class SupabaseStore implements DatabaseClient {
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DEMO_MODE=false');
    }
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getLeads(filters: LeadFilters = {}): Promise<Lead[]> {
    let query = this.client.from('leads').select('*');

    if (filters.state) query = query.eq('state', filters.state.toUpperCase());
    if (filters.county) query = query.ilike('county', filters.county);
    if (filters.distressType) query = query.contains('distress_types', [filters.distressType]);
    if (typeof filters.minScore === 'number' && Number.isFinite(filters.minScore)) {
      query = query.gte('motivation_score', filters.minScore);
    }
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.dateFrom) query = query.gte('first_seen_at', new Date(filters.dateFrom).toISOString());
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setUTCHours(23, 59, 59, 999);
      query = query.lte('first_seen_at', end.toISOString());
    }
    if (filters.search) {
      const safe = filters.search.replace(/[,%]/g, '');
      query = query.or(
        `address.ilike.%${safe}%,city.ilike.%${safe}%,county.ilike.%${safe}%,owner_name.ilike.%${safe}%,parcel_id.ilike.%${safe}%`
      );
    }

    const sortBy = filters.sortBy ?? 'motivation_score';
    const ascending = filters.sortDir === 'asc';
    query = query.order(sortBy, { ascending, nullsFirst: false });

    if (filters.limit && filters.limit > 0) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase getLeads error: ${error.message}`);
    return (data ?? []) as Lead[];
  }

  async getLeadById(id: string): Promise<{ lead: Lead; history: LeadHistoryEvent[] } | null> {
    const { data: lead, error } = await this.client.from('leads').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase getLeadById error: ${error.message}`);
    if (!lead) return null;

    const { data: history, error: histErr } = await this.client
      .from('lead_history')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false });
    if (histErr) throw new Error(`Supabase lead_history error: ${histErr.message}`);

    return { lead: lead as Lead, history: (history ?? []) as LeadHistoryEvent[] };
  }

  async getTop10Today(): Promise<Lead[]> {
    return this.getLeads({
      status: 'active',
      sortBy: 'motivation_score',
      sortDir: 'desc',
      limit: 10,
    });
  }

  async upsertValidatedLead(candidate: ValidatedLeadCandidate, nowIso: string): Promise<UpsertLeadOutcome> {
    // Look up by dedupe_key first, then fallback to normalized_address + county + state
    const { data: byKey, error: keyErr } = await this.client
      .from('leads')
      .select('*')
      .eq('dedupe_key', candidate.dedupeKey)
      .maybeSingle();
    if (keyErr) throw new Error(`Supabase lookup by dedupe_key failed: ${keyErr.message}`);

    let existing = byKey as Lead | null;
    if (!existing) {
      const { data: byAddr, error: addrErr } = await this.client
        .from('leads')
        .select('*')
        .eq('normalized_address', candidate.normalizedAddress)
        .ilike('county', candidate.county)
        .eq('state', candidate.state)
        .maybeSingle();
      if (addrErr) throw new Error(`Supabase lookup by address failed: ${addrErr.message}`);
      existing = byAddr as Lead | null;
    }

    if (!existing) {
      const { score, breakdown } = calculateMotivationScore({
        distressTypes: [candidate.distressType],
        auctionDate: candidate.auctionDate,
        taxDelinquentAmount: candidate.taxDelinquentAmount,
        firstSeenAt: nowIso,
        address: candidate.address,
        mailingAddress: candidate.mailingAddress,
        enrichment: candidate.enrichment ?? {},
      });

      const insertPayload = {
        dedupe_key: candidate.dedupeKey,
        parcel_id: candidate.parcelId,
        address: candidate.address,
        normalized_address: candidate.normalizedAddress,
        city: candidate.city,
        county: candidate.county,
        state: candidate.state,
        zip: candidate.zip,
        owner_name: candidate.ownerName,
        mailing_address: candidate.mailingAddress,
        property_type: candidate.propertyType,
        assessed_value: candidate.assessedValue,
        tax_delinquent_amount: candidate.taxDelinquentAmount,
        auction_date: candidate.auctionDate,
        distress_types: [candidate.distressType],
        primary_distress_type: candidate.distressType,
        source_url: candidate.sourceUrl,
        source_name: candidate.sourceName,
        sources: [
          {
            sourceId: candidate.sourceId,
            sourceName: candidate.sourceName,
            sourceUrl: candidate.sourceUrl,
            distressType: candidate.distressType,
            firstSeenAt: nowIso,
            lastSeenAt: nowIso,
            rawExcerpt: candidate.rawExcerpt,
          },
        ],
        enrichment: candidate.enrichment ?? {},
        motivation_score: score,
        score_breakdown: breakdown,
        status: 'active',
        first_seen_at: nowIso,
        last_seen_at: nowIso,
      };

      const { data: inserted, error: insErr } = await this.client
        .from('leads')
        .insert(insertPayload)
        .select('*')
        .single();
      if (insErr) throw new Error(`Supabase insert lead failed: ${insErr.message}`);

      const lead = inserted as Lead;
      await this.appendLeadHistory(
        lead.id,
        'created',
        {
          source: candidate.sourceName,
          sourceUrl: candidate.sourceUrl,
          distressType: candidate.distressType,
          score,
        },
        nowIso
      );

      return { action: 'inserted', lead, newSignalAdded: true };
    }

    const newSignalAdded = !existing.distress_types.includes(candidate.distressType);
    const mergedSignals = newSignalAdded
      ? [...existing.distress_types, candidate.distressType]
      : existing.distress_types;

    const updatedSources = [...(existing.sources ?? [])];
    const srcIdx = updatedSources.findIndex(
      (s) => s.sourceId === candidate.sourceId && s.distressType === candidate.distressType
    );
    if (srcIdx >= 0) {
      updatedSources[srcIdx] = {
        ...updatedSources[srcIdx],
        sourceUrl: candidate.sourceUrl,
        lastSeenAt: nowIso,
      };
    } else {
      updatedSources.push({
        sourceId: candidate.sourceId,
        sourceName: candidate.sourceName,
        sourceUrl: candidate.sourceUrl,
        distressType: candidate.distressType,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        rawExcerpt: candidate.rawExcerpt,
      });
    }

    const mergedEnrichment = { ...(existing.enrichment ?? {}), ...(candidate.enrichment ?? {}) };
    const taxDelinquentAmount = candidate.taxDelinquentAmount ?? existing.tax_delinquent_amount;
    const auctionDate = candidate.auctionDate ?? existing.auction_date;
    const mailingAddress = candidate.mailingAddress ?? existing.mailing_address;

    const { score, breakdown } = calculateMotivationScore({
      distressTypes: mergedSignals,
      auctionDate,
      taxDelinquentAmount,
      firstSeenAt: existing.first_seen_at,
      address: existing.address,
      mailingAddress,
      enrichment: mergedEnrichment,
    });

    const { data: updated, error: updErr } = await this.client
      .from('leads')
      .update({
        parcel_id: existing.parcel_id ?? candidate.parcelId,
        city: existing.city ?? candidate.city,
        zip: existing.zip ?? candidate.zip,
        owner_name: existing.owner_name ?? candidate.ownerName,
        mailing_address: mailingAddress,
        property_type: existing.property_type ?? candidate.propertyType,
        assessed_value: existing.assessed_value ?? candidate.assessedValue,
        tax_delinquent_amount: taxDelinquentAmount,
        auction_date: auctionDate,
        distress_types: mergedSignals,
        sources: updatedSources,
        enrichment: mergedEnrichment,
        motivation_score: score,
        score_breakdown: breakdown,
        last_seen_at: nowIso,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (updErr) throw new Error(`Supabase merge lead failed: ${updErr.message}`);

    const lead = updated as Lead;
    await this.appendLeadHistory(
      lead.id,
      newSignalAdded ? 'signal_added' : 'seen_again',
      {
        source: candidate.sourceName,
        sourceUrl: candidate.sourceUrl,
        distressType: candidate.distressType,
        score,
      },
      nowIso
    );

    return { action: 'merged', lead, newSignalAdded };
  }

  async updateLeadDetails(
    id: string,
    patch: {
      status?: LeadStatus;
      notes?: string;
      skip_trace_status?: SkipTraceStatus;
      skip_trace_notes?: string;
    }
  ): Promise<Lead | null> {
    const existing = await this.getLeadById(id);
    if (!existing) return null;
    const nowIso = new Date().toISOString();

    const { data, error } = await this.client
      .from('leads')
      .update({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.skip_trace_status !== undefined ? { skip_trace_status: patch.skip_trace_status } : {}),
        ...(patch.skip_trace_notes !== undefined ? { skip_trace_notes: patch.skip_trace_notes } : {}),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(`Supabase updateLeadDetails failed: ${error.message}`);

    if (patch.status && patch.status !== existing.lead.status) {
      await this.appendLeadHistory(id, 'status_changed', { from: existing.lead.status, to: patch.status }, nowIso);
    }
    if (patch.notes !== undefined && patch.notes !== existing.lead.notes) {
      await this.appendLeadHistory(id, 'note_updated', { excerpt: patch.notes.slice(0, 120) }, nowIso);
    }
    if (
      (patch.skip_trace_status && patch.skip_trace_status !== existing.lead.skip_trace_status) ||
      (patch.skip_trace_notes !== undefined && patch.skip_trace_notes !== existing.lead.skip_trace_notes)
    ) {
      await this.appendLeadHistory(
        id,
        'skip_trace_updated',
        { status: patch.skip_trace_status ?? existing.lead.skip_trace_status },
        nowIso
      );
    }

    return data as Lead;
  }

  async applyLeadEnrichment(
    id: string,
    data: {
      parcelId?: string | null;
      ownerName?: string | null;
      mailingAddress?: string | null;
      assessedValue?: number | null;
      propertyType?: string | null;
      enrichment: Lead['enrichment'];
    },
    nowIso: string
  ): Promise<Lead | null> {
    const found = await this.getLeadById(id);
    if (!found) return null;
    const existing = found.lead;

    const mergedEnrichment = { ...(existing.enrichment ?? {}), ...data.enrichment, enrichedAt: nowIso };
    const mailingAddress = data.mailingAddress ?? existing.mailing_address;

    const { score, breakdown } = calculateMotivationScore({
      distressTypes: existing.distress_types,
      auctionDate: existing.auction_date,
      taxDelinquentAmount: existing.tax_delinquent_amount,
      firstSeenAt: existing.first_seen_at,
      address: existing.address,
      mailingAddress,
      enrichment: mergedEnrichment,
    });

    const { data: updated, error } = await this.client
      .from('leads')
      .update({
        parcel_id: existing.parcel_id ?? data.parcelId ?? null,
        owner_name: existing.owner_name ?? data.ownerName ?? null,
        mailing_address: mailingAddress,
        assessed_value: existing.assessed_value ?? data.assessedValue ?? null,
        property_type: existing.property_type ?? data.propertyType ?? null,
        enrichment: mergedEnrichment,
        motivation_score: score,
        score_breakdown: breakdown,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(`Supabase applyLeadEnrichment failed: ${error.message}`);

    await this.appendLeadHistory(
      id,
      'enriched',
      { source: data.enrichment.enrichmentSource ?? 'qPublic', score },
      nowIso
    );
    return updated as Lead;
  }

  async flagStale120Leads(nowIso: string): Promise<number> {
    const now = new Date(nowIso);
    const cutoff = new Date(now.getTime() - 120 * 86400 * 1000).toISOString();

    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .eq('status', 'active')
      .lte('first_seen_at', cutoff);
    if (error) throw new Error(`Supabase flagStale120Leads query failed: ${error.message}`);

    let flagged = 0;
    for (const lead of (data ?? []) as Lead[]) {
      if (lead.distress_types.includes('stale_120_plus')) continue;
      if (!isEligibleForStale120(lead.first_seen_at, now)) continue;

      const updatedSignals = [...lead.distress_types, 'stale_120_plus' as const];
      const { score, breakdown } = calculateMotivationScore({
        distressTypes: updatedSignals,
        auctionDate: lead.auction_date,
        taxDelinquentAmount: lead.tax_delinquent_amount,
        firstSeenAt: lead.first_seen_at,
        address: lead.address,
        mailingAddress: lead.mailing_address,
        enrichment: lead.enrichment,
        now,
      });

      const { error: updErr } = await this.client
        .from('leads')
        .update({
          distress_types: updatedSignals,
          motivation_score: score,
          score_breakdown: breakdown,
        })
        .eq('id', lead.id);
      if (updErr) throw new Error(`Supabase stale_120_plus update failed: ${updErr.message}`);

      await this.appendLeadHistory(
        lead.id,
        'stale_flagged',
        { firstSeenAt: lead.first_seen_at, newScore: score },
        nowIso
      );
      flagged++;
    }

    return flagged;
  }

  async appendLeadHistory(
    leadId: string,
    eventType: LeadHistoryEventType,
    details: Record<string, unknown>,
    nowIso: string = new Date().toISOString()
  ): Promise<void> {
    const { error } = await this.client.from('lead_history').insert({
      lead_id: leadId,
      event_type: eventType,
      details,
      created_at: nowIso,
    });
    if (error) throw new Error(`Supabase appendLeadHistory failed: ${error.message}`);
  }

  async getSourceHealth(): Promise<SourceHealth[]> {
    const { data, error } = await this.client
      .from('source_health')
      .select('*')
      .order('source_key', { ascending: true });
    if (error) throw new Error(`Supabase getSourceHealth failed: ${error.message}`);
    return (data ?? []) as SourceHealth[];
  }

  async recordSourceHealthSuccess(input: {
    sourceKey: string;
    sourceId: string;
    sourceName: string;
    state: string;
    county: string;
    recordCount: number;
    nowIso: string;
  }): Promise<SourceHealth> {
    const { data: prev } = await this.client
      .from('source_health')
      .select('*')
      .eq('source_key', input.sourceKey)
      .maybeSingle();

    const prevRow = prev as SourceHealth | null;
    const hadRecordsBefore = Boolean(
      prevRow?.has_ever_produced_records || (prevRow?.last_record_count ?? 0) > 0
    );
    const hasEverProduced = hadRecordsBefore || input.recordCount > 0;
    const consecutiveZeroRuns =
      input.recordCount > 0
        ? 0
        : hadRecordsBefore
          ? (prevRow?.consecutive_zero_runs ?? 0) + 1
          : 0;

    const { data, error } = await this.client
      .from('source_health')
      .upsert({
        source_key: input.sourceKey,
        source_id: input.sourceId,
        source_name: input.sourceName,
        state: input.state,
        county: input.county,
        status: 'healthy',
        last_attempt_at: input.nowIso,
        last_success_at: input.nowIso,
        last_record_count: input.recordCount,
        consecutive_failures: 0,
        consecutive_zero_runs: consecutiveZeroRuns,
        has_ever_produced_records: hasEverProduced,
        last_error: null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`Supabase recordSourceHealthSuccess failed: ${error.message}`);
    return data as SourceHealth;
  }

  async recordSourceHealthError(input: {
    sourceKey: string;
    sourceId: string;
    sourceName: string;
    state: string;
    county: string;
    error: StructuredErrorInfo;
    nowIso: string;
  }): Promise<SourceHealth> {
    const { data: prev } = await this.client
      .from('source_health')
      .select('*')
      .eq('source_key', input.sourceKey)
      .maybeSingle();

    const prevRow = prev as SourceHealth | null;

    const { data, error } = await this.client
      .from('source_health')
      .upsert({
        source_key: input.sourceKey,
        source_id: input.sourceId,
        source_name: input.sourceName,
        state: input.state,
        county: input.county,
        status: 'error',
        last_attempt_at: input.nowIso,
        last_success_at: prevRow?.last_success_at ?? null,
        last_record_count: prevRow?.last_record_count ?? 0,
        consecutive_failures: (prevRow?.consecutive_failures ?? 0) + 1,
        consecutive_zero_runs: prevRow?.consecutive_zero_runs ?? 0,
        has_ever_produced_records: prevRow?.has_ever_produced_records ?? false,
        last_error: input.error,
      })
      .select('*')
      .single();
    if (error) throw new Error(`Supabase recordSourceHealthError failed: ${error.message}`);
    return data as SourceHealth;
  }

  async startScanRun(nowIso: string): Promise<ScanRun> {
    const { data, error } = await this.client
      .from('scan_runs')
      .insert({ started_at: nowIso, status: 'running' })
      .select('*')
      .single();
    if (error) throw new Error(`Supabase startScanRun failed: ${error.message}`);
    return data as ScanRun;
  }

  async finishScanRun(
    id: string,
    patch: {
      finished_at: string;
      status: ScanRun['status'];
      leads_added: number;
      leads_updated: number;
      duplicates_merged: number;
      records_rejected: number;
      stale_flagged: number;
      high_score_alerts_sent: number;
      email_type_sent: ScanRun['email_type_sent'];
      error_summary: string | null;
      per_source_stats: Record<string, PerSourceRunStat>;
    }
  ): Promise<ScanRun> {
    const { data, error } = await this.client
      .from('scan_runs')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(`Supabase finishScanRun failed: ${error.message}`);
    return data as ScanRun;
  }

  async getRecentScanRuns(limit = 10): Promise<ScanRun[]> {
    const { data, error } = await this.client
      .from('scan_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Supabase getRecentScanRuns failed: ${error.message}`);
    return (data ?? []) as ScanRun[];
  }

  async logRejectedRecord(input: {
    scanRunId: string | null;
    sourceId: string;
    county: string;
    state: string;
    reason: string;
    rawPayload: Record<string, unknown>;
    nowIso: string;
  }): Promise<void> {
    const { error } = await this.client.from('rejected_records').insert({
      scan_run_id: input.scanRunId,
      source_id: input.sourceId,
      county: input.county,
      state: input.state,
      reason: input.reason,
      raw_payload: input.rawPayload,
      created_at: input.nowIso,
    });
    if (error) throw new Error(`Supabase logRejectedRecord failed: ${error.message}`);
  }

  async getDashboardSummary(): Promise<DashboardSummary> {
    const [allLeads, sourceHealth, recentRuns] = await Promise.all([
      this.getLeads({ sortBy: 'motivation_score', sortDir: 'desc' }),
      this.getSourceHealth(),
      this.getRecentScanRuns(8),
    ]);

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const activeLeads = allLeads.filter((l) => l.status === 'active');
    const newToday = allLeads.filter((l) => new Date(l.first_seen_at).getTime() >= todayMs).length;
    const stale120Count = activeLeads.filter((l) => l.distress_types.includes('stale_120_plus')).length;
    const highScoreCount = activeLeads.filter((l) => l.motivation_score >= 70).length;

    const byDistressType: Record<string, number> = {};
    const countyMap = new Map<string, { state: string; county: string; count: number }>();

    for (const lead of activeLeads) {
      for (const dt of lead.distress_types) {
        byDistressType[dt] = (byDistressType[dt] ?? 0) + 1;
      }
      const key = `${lead.state}:${lead.county}`;
      const prev = countyMap.get(key);
      if (prev) prev.count += 1;
      else countyMap.set(key, { state: lead.state, county: lead.county, count: 1 });
    }

    return {
      newToday,
      totalActive: activeLeads.length,
      totalLeads: allLeads.length,
      stale120Count,
      highScoreCount,
      byDistressType,
      byCounty: Array.from(countyMap.values()).sort((a, b) => b.count - a.count),
      sourceHealth,
      recentRuns,
      top10: activeLeads.slice(0, 10),
      demoMode: false,
    };
  }
}
