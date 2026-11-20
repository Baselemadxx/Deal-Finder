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

export interface UpsertLeadOutcome {
  action: 'inserted' | 'merged';
  lead: Lead;
  newSignalAdded: boolean;
}

export interface DatabaseClient {
  // Leads
  getLeads(filters?: LeadFilters): Promise<Lead[]>;
  getLeadById(id: string): Promise<{ lead: Lead; history: LeadHistoryEvent[] } | null>;
  getTop10Today(): Promise<Lead[]>;
  upsertValidatedLead(candidate: ValidatedLeadCandidate, nowIso: string): Promise<UpsertLeadOutcome>;
  updateLeadDetails(
    id: string,
    patch: {
      status?: LeadStatus;
      notes?: string;
      skip_trace_status?: SkipTraceStatus;
      skip_trace_notes?: string;
    }
  ): Promise<Lead | null>;
  applyLeadEnrichment(
    id: string,
    enrichment: {
      parcelId?: string | null;
      ownerName?: string | null;
      mailingAddress?: string | null;
      assessedValue?: number | null;
      propertyType?: string | null;
      enrichment: Lead['enrichment'];
    },
    nowIso: string
  ): Promise<Lead | null>;
  flagStale120Leads(nowIso: string): Promise<number>;

  // History
  appendLeadHistory(
    leadId: string,
    eventType: LeadHistoryEventType,
    details: Record<string, unknown>,
    nowIso?: string
  ): Promise<void>;

  // Source Health Heartbeat
  getSourceHealth(): Promise<SourceHealth[]>;
  recordSourceHealthSuccess(input: {
    sourceKey: string;
    sourceId: string;
    sourceName: string;
    state: string;
    county: string;
    recordCount: number;
    nowIso: string;
  }): Promise<SourceHealth>;
  recordSourceHealthError(input: {
    sourceKey: string;
    sourceId: string;
    sourceName: string;
    state: string;
    county: string;
    error: StructuredErrorInfo;
    nowIso: string;
  }): Promise<SourceHealth>;

  // Scan Runs & Rejected Records
  startScanRun(nowIso: string): Promise<ScanRun>;
  finishScanRun(
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
  ): Promise<ScanRun>;
  getRecentScanRuns(limit?: number): Promise<ScanRun[]>;
  logRejectedRecord(input: {
    scanRunId: string | null;
    sourceId: string;
    county: string;
    state: string;
    reason: string;
    rawPayload: Record<string, unknown>;
    nowIso: string;
  }): Promise<void>;

  // Dashboard
  getDashboardSummary(): Promise<DashboardSummary>;
}
