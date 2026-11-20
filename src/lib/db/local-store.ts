import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isDemoMode } from '../config';
import { calculateMotivationScore, isEligibleForStale120 } from '../scoring';
import {
  DashboardSummary,
  Lead,
  LeadFilters,
  LeadHistoryEvent,
  LeadHistoryEventType,
  LeadStatus,
  PerSourceRunStat,
  RejectedRecord,
  ScanRun,
  SkipTraceStatus,
  SourceHealth,
  StructuredErrorInfo,
} from '../types';
import { ValidatedLeadCandidate } from '../validation';
import { DatabaseClient, UpsertLeadOutcome } from './interface';
import { buildSeedDataset } from './seed-data';

interface LocalDbFile {
  leads: Lead[];
  history: LeadHistoryEvent[];
  sourceHealth: SourceHealth[];
  scanRuns: ScanRun[];
  rejectedRecords: RejectedRecord[];
}

export class LocalFileStore implements DatabaseClient {
  private readonly filePath: string;

  constructor(customPath?: string) {
    this.filePath = customPath ?? path.join(process.cwd(), '.data', 'local-db.json');
  }

  private readDb(): LocalDbFile {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      const seed = buildSeedDataset();
      const initial: LocalDbFile = {
        ...seed,
        rejectedRecords: [],
      };
      fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }

    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw) as LocalDbFile;
  }

  private writeDb(db: LocalDbFile): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(db, null, 2), 'utf-8');
  }

  public resetWithSeed(): void {
    const seed = buildSeedDataset();
    this.writeDb({ ...seed, rejectedRecords: [] });
  }

  async getLeads(filters: LeadFilters = {}): Promise<Lead[]> {
    const db = this.readDb();
    let results = [...db.leads];

    if (filters.state) {
      const st = filters.state.toUpperCase();
      results = results.filter((l) => l.state.toUpperCase() === st);
    }
    if (filters.county) {
      const cty = filters.county.toLowerCase();
      results = results.filter((l) => l.county.toLowerCase() === cty);
    }
    if (filters.distressType) {
      results = results.filter((l) => l.distress_types.includes(filters.distressType as Lead['primary_distress_type']));
    }
    if (typeof filters.minScore === 'number' && Number.isFinite(filters.minScore)) {
      results = results.filter((l) => l.motivation_score >= filters.minScore!);
    }
    if (filters.status) {
      results = results.filter((l) => l.status === filters.status);
    }
    if (filters.dateFrom) {
      const fromMs = new Date(filters.dateFrom).getTime();
      if (!Number.isNaN(fromMs)) {
        results = results.filter((l) => new Date(l.first_seen_at).getTime() >= fromMs);
      }
    }
    if (filters.dateTo) {
      const toMs = new Date(filters.dateTo).getTime() + 86400 * 1000 - 1;
      if (!Number.isNaN(toMs)) {
        results = results.filter((l) => new Date(l.first_seen_at).getTime() <= toMs);
      }
    }
    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      results = results.filter(
        (l) =>
          l.address.toLowerCase().includes(q) ||
          (l.city ?? '').toLowerCase().includes(q) ||
          l.county.toLowerCase().includes(q) ||
          (l.owner_name ?? '').toLowerCase().includes(q) ||
          (l.parcel_id ?? '').toLowerCase().includes(q)
      );
    }

    const sortBy = filters.sortBy ?? 'motivation_score';
    const sortDir = filters.sortDir ?? 'desc';
    const mult = sortDir === 'asc' ? 1 : -1;

    results.sort((a, b) => {
      const av = a[sortBy] ?? '';
      const bv = b[sortBy] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * mult;
      }
      return String(av).localeCompare(String(bv)) * mult;
    });

    if (filters.limit && filters.limit > 0) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  async getLeadById(id: string): Promise<{ lead: Lead; history: LeadHistoryEvent[] } | null> {
    const db = this.readDb();
    const lead = db.leads.find((l) => l.id === id);
    if (!lead) return null;
    const history = db.history
      .filter((h) => h.lead_id === id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { lead, history };
  }

  async getTop10Today(): Promise<Lead[]> {
    const active = await this.getLeads({ status: 'active', sortBy: 'motivation_score', sortDir: 'desc' });
    return active.slice(0, 10);
  }

  async upsertValidatedLead(candidate: ValidatedLeadCandidate, nowIso: string): Promise<UpsertLeadOutcome> {
    const db = this.readDb();
    const existingIdx = db.leads.findIndex(
      (l) =>
        l.dedupe_key === candidate.dedupeKey ||
        (candidate.parcelId && l.parcel_id && l.parcel_id === candidate.parcelId && l.state === candidate.state) ||
        (l.normalized_address === candidate.normalizedAddress &&
          l.county.toLowerCase() === candidate.county.toLowerCase() &&
          l.state === candidate.state)
    );

    if (existingIdx === -1) {
      const { score, breakdown } = calculateMotivationScore({
        distressTypes: [candidate.distressType],
        auctionDate: candidate.auctionDate,
        taxDelinquentAmount: candidate.taxDelinquentAmount,
        firstSeenAt: nowIso,
        address: candidate.address,
        mailingAddress: candidate.mailingAddress,
        enrichment: candidate.enrichment ?? {},
      });

      const newLead: Lead = {
        id: crypto.randomUUID(),
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
        notes: '',
        skip_trace_status: 'not_started',
        skip_trace_notes: '',
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      };

      db.leads.push(newLead);
      db.history.push({
        id: crypto.randomUUID(),
        lead_id: newLead.id,
        event_type: 'created',
        details: {
          source: candidate.sourceName,
          sourceUrl: candidate.sourceUrl,
          distressType: candidate.distressType,
          score,
        },
        created_at: nowIso,
      });
      this.writeDb(db);
      return { action: 'inserted', lead: newLead, newSignalAdded: true };
    }

    const existing = db.leads[existingIdx];
    const newSignalAdded = !existing.distress_types.includes(candidate.distressType);
    const mergedSignals = newSignalAdded
      ? [...existing.distress_types, candidate.distressType]
      : existing.distress_types;

    const existingSourceIdx = existing.sources.findIndex(
      (s) => s.sourceId === candidate.sourceId && s.distressType === candidate.distressType
    );
    const updatedSources = [...existing.sources];
    if (existingSourceIdx >= 0) {
      updatedSources[existingSourceIdx] = {
        ...updatedSources[existingSourceIdx],
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

    const mergedEnrichment = { ...existing.enrichment, ...(candidate.enrichment ?? {}) };
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

    const updatedLead: Lead = {
      ...existing,
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
      updated_at: nowIso,
    };

    db.leads[existingIdx] = updatedLead;
    db.history.push({
      id: crypto.randomUUID(),
      lead_id: updatedLead.id,
      event_type: newSignalAdded ? 'signal_added' : 'seen_again',
      details: {
        source: candidate.sourceName,
        sourceUrl: candidate.sourceUrl,
        distressType: candidate.distressType,
        score,
      },
      created_at: nowIso,
    });
    this.writeDb(db);
    return { action: 'merged', lead: updatedLead, newSignalAdded };
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
    const db = this.readDb();
    const idx = db.leads.findIndex((l) => l.id === id);
    if (idx === -1) return null;

    const existing = db.leads[idx];
    const nowIso = new Date().toISOString();

    if (patch.status && patch.status !== existing.status) {
      db.history.push({
        id: crypto.randomUUID(),
        lead_id: id,
        event_type: 'status_changed',
        details: { from: existing.status, to: patch.status },
        created_at: nowIso,
      });
    }
    if (patch.notes !== undefined && patch.notes !== existing.notes) {
      db.history.push({
        id: crypto.randomUUID(),
        lead_id: id,
        event_type: 'note_updated',
        details: { excerpt: patch.notes.slice(0, 120) },
        created_at: nowIso,
      });
    }
    if (
      (patch.skip_trace_status && patch.skip_trace_status !== existing.skip_trace_status) ||
      (patch.skip_trace_notes !== undefined && patch.skip_trace_notes !== existing.skip_trace_notes)
    ) {
      db.history.push({
        id: crypto.randomUUID(),
        lead_id: id,
        event_type: 'skip_trace_updated',
        details: {
          status: patch.skip_trace_status ?? existing.skip_trace_status,
        },
        created_at: nowIso,
      });
    }

    const updated: Lead = {
      ...existing,
      status: patch.status ?? existing.status,
      notes: patch.notes ?? existing.notes,
      skip_trace_status: patch.skip_trace_status ?? existing.skip_trace_status,
      skip_trace_notes: patch.skip_trace_notes ?? existing.skip_trace_notes,
      updated_at: nowIso,
    };
    db.leads[idx] = updated;
    this.writeDb(db);
    return updated;
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
    const db = this.readDb();
    const idx = db.leads.findIndex((l) => l.id === id);
    if (idx === -1) return null;

    const existing = db.leads[idx];
    const mergedEnrichment = { ...existing.enrichment, ...data.enrichment, enrichedAt: nowIso };
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

    const updated: Lead = {
      ...existing,
      parcel_id: existing.parcel_id ?? data.parcelId ?? null,
      owner_name: existing.owner_name ?? data.ownerName ?? null,
      mailing_address: mailingAddress,
      assessed_value: existing.assessed_value ?? data.assessedValue ?? null,
      property_type: existing.property_type ?? data.propertyType ?? null,
      enrichment: mergedEnrichment,
      motivation_score: score,
      score_breakdown: breakdown,
      updated_at: nowIso,
    };

    db.leads[idx] = updated;
    db.history.push({
      id: crypto.randomUUID(),
      lead_id: id,
      event_type: 'enriched',
      details: { source: data.enrichment.enrichmentSource ?? 'qPublic', score },
      created_at: nowIso,
    });
    this.writeDb(db);
    return updated;
  }

  async flagStale120Leads(nowIso: string): Promise<number> {
    const db = this.readDb();
    const now = new Date(nowIso);
    let flagged = 0;

    for (let i = 0; i < db.leads.length; i++) {
      const lead = db.leads[i];
      if (lead.status !== 'active') continue;
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

      db.leads[i] = {
        ...lead,
        distress_types: updatedSignals,
        motivation_score: score,
        score_breakdown: breakdown,
        updated_at: nowIso,
      };
      db.history.push({
        id: crypto.randomUUID(),
        lead_id: lead.id,
        event_type: 'stale_flagged',
        details: {
          firstSeenAt: lead.first_seen_at,
          newScore: score,
        },
        created_at: nowIso,
      });
      flagged++;
    }

    if (flagged > 0) this.writeDb(db);
    return flagged;
  }

  async appendLeadHistory(
    leadId: string,
    eventType: LeadHistoryEventType,
    details: Record<string, unknown>,
    nowIso: string = new Date().toISOString()
  ): Promise<void> {
    const db = this.readDb();
    db.history.push({
      id: crypto.randomUUID(),
      lead_id: leadId,
      event_type: eventType,
      details,
      created_at: nowIso,
    });
    this.writeDb(db);
  }

  async getSourceHealth(): Promise<SourceHealth[]> {
    const db = this.readDb();
    return [...db.sourceHealth].sort((a, b) => a.source_key.localeCompare(b.source_key));
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
    const db = this.readDb();
    const idx = db.sourceHealth.findIndex((s) => s.source_key === input.sourceKey);
    const prev = idx >= 0 ? db.sourceHealth[idx] : null;
    const hadRecordsBefore = Boolean(
      prev?.has_ever_produced_records || (prev?.last_record_count ?? 0) > 0
    );
    const hasEverProduced = hadRecordsBefore || input.recordCount > 0;
    const consecutiveZeroRuns =
      input.recordCount > 0
        ? 0
        : hadRecordsBefore
          ? (prev?.consecutive_zero_runs ?? 0) + 1
          : 0;

    const record: SourceHealth = {
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
      updated_at: input.nowIso,
    };

    if (idx >= 0) db.sourceHealth[idx] = record;
    else db.sourceHealth.push(record);
    this.writeDb(db);
    return record;
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
    const db = this.readDb();
    const idx = db.sourceHealth.findIndex((s) => s.source_key === input.sourceKey);
    const prev = idx >= 0 ? db.sourceHealth[idx] : null;

    const record: SourceHealth = {
      source_key: input.sourceKey,
      source_id: input.sourceId,
      source_name: input.sourceName,
      state: input.state,
      county: input.county,
      status: 'error',
      last_attempt_at: input.nowIso,
      last_success_at: prev?.last_success_at ?? null,
      last_record_count: prev?.last_record_count ?? 0,
      consecutive_failures: (prev?.consecutive_failures ?? 0) + 1,
      consecutive_zero_runs: prev?.consecutive_zero_runs ?? 0,
      has_ever_produced_records: prev?.has_ever_produced_records ?? false,
      last_error: input.error,
      updated_at: input.nowIso,
    };

    if (idx >= 0) db.sourceHealth[idx] = record;
    else db.sourceHealth.push(record);
    this.writeDb(db);
    return record;
  }

  async startScanRun(nowIso: string): Promise<ScanRun> {
    const db = this.readDb();
    const run: ScanRun = {
      id: crypto.randomUUID(),
      started_at: nowIso,
      finished_at: null,
      status: 'running',
      leads_added: 0,
      leads_updated: 0,
      duplicates_merged: 0,
      records_rejected: 0,
      stale_flagged: 0,
      high_score_alerts_sent: 0,
      email_type_sent: 'none',
      error_summary: null,
      per_source_stats: {},
    };
    db.scanRuns.unshift(run);
    this.writeDb(db);
    return run;
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
    const db = this.readDb();
    const idx = db.scanRuns.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new Error(`ScanRun ${id} not found`);
    }
    const updated: ScanRun = { ...db.scanRuns[idx], ...patch };
    db.scanRuns[idx] = updated;
    this.writeDb(db);
    return updated;
  }

  async getRecentScanRuns(limit = 10): Promise<ScanRun[]> {
    const db = this.readDb();
    return [...db.scanRuns]
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, limit);
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
    const db = this.readDb();
    db.rejectedRecords.push({
      id: crypto.randomUUID(),
      scan_run_id: input.scanRunId,
      source_id: input.sourceId,
      county: input.county,
      state: input.state,
      reason: input.reason,
      raw_payload: input.rawPayload,
      created_at: input.nowIso,
    });
    this.writeDb(db);
  }

  async getDashboardSummary(): Promise<DashboardSummary> {
    const db = this.readDb();
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const activeLeads = db.leads.filter((l) => l.status === 'active');
    const newToday = db.leads.filter((l) => new Date(l.first_seen_at).getTime() >= todayMs).length;
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

    const byCounty = Array.from(countyMap.values()).sort((a, b) => b.count - a.count);
    const top10 = [...activeLeads]
      .sort((a, b) => b.motivation_score - a.motivation_score)
      .slice(0, 10);

    return {
      newToday,
      totalActive: activeLeads.length,
      totalLeads: db.leads.length,
      stale120Count,
      highScoreCount,
      byDistressType,
      byCounty,
      sourceHealth: await this.getSourceHealth(),
      recentRuns: await this.getRecentScanRuns(8),
      top10,
      demoMode: isDemoMode(),
    };
  }
}
