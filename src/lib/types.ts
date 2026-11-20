export type DistressType =
  | 'pre_foreclosure'
  | 'foreclosure_auction'
  | 'tax_sale'
  | 'tax_delinquent'
  | 'lis_pendens'
  | 'tax_deed'
  | 'gov_reo'
  | 'stale_120_plus';

export const DISTRESS_TYPE_LABELS: Record<DistressType, string> = {
  pre_foreclosure: 'Pre-Foreclosure',
  foreclosure_auction: 'Foreclosure Auction',
  tax_sale: 'Tax Sale',
  tax_delinquent: 'Tax Delinquent',
  lis_pendens: 'Lis Pendens',
  tax_deed: 'Tax Deed Sale',
  gov_reo: 'Gov Inventory (REO)',
  stale_120_plus: 'Stale 120+ Days',
};

export type LeadStatus = 'active' | 'contacted' | 'under_contract' | 'dead' | 'sold';

export type SkipTraceStatus = 'not_started' | 'in_progress' | 'completed';

export interface LeadSourceRecord {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  distressType: DistressType;
  firstSeenAt: string;
  lastSeenAt: string;
  rawExcerpt?: string;
}

export interface ScoreBreakdownItem {
  label: string;
  points: number;
  reason: string;
}

export interface LeadEnrichment {
  parcelUrl?: string;
  yearBuilt?: number;
  sqft?: number;
  beds?: number;
  baths?: number;
  lotSize?: string;
  lastSaleDate?: string;
  lastSalePrice?: number;
  absenteeOwner?: boolean;
  homesteadExemption?: boolean;
  caseNumber?: string;
  plaintiff?: string;
  enrichedAt?: string;
  enrichmentSource?: string;
}

export interface Lead {
  id: string;
  dedupe_key: string;
  parcel_id: string | null;
  address: string;
  normalized_address: string;
  city: string | null;
  county: string;
  state: string;
  zip: string | null;
  owner_name: string | null;
  mailing_address: string | null;
  property_type: string | null;
  assessed_value: number | null;
  tax_delinquent_amount: number | null;
  auction_date: string | null;
  distress_types: DistressType[];
  primary_distress_type: DistressType;
  source_url: string;
  source_name: string;
  sources: LeadSourceRecord[];
  enrichment: LeadEnrichment;
  motivation_score: number;
  score_breakdown: ScoreBreakdownItem[];
  status: LeadStatus;
  notes: string;
  skip_trace_status: SkipTraceStatus;
  skip_trace_notes: string;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export type LeadHistoryEventType =
  | 'created'
  | 'seen_again'
  | 'signal_added'
  | 'enriched'
  | 'status_changed'
  | 'stale_flagged'
  | 'note_updated'
  | 'skip_trace_updated';

export interface LeadHistoryEvent {
  id: string;
  lead_id: string;
  event_type: LeadHistoryEventType;
  details: Record<string, unknown>;
  created_at: string;
}

export interface StructuredErrorInfo {
  source: string;
  county: string;
  state: string;
  timestamp: string;
  message: string;
  stack?: string;
  httpStatus?: number;
  code?: string;
}

export interface SourceHealth {
  source_key: string;
  source_id: string;
  source_name: string;
  state: string;
  county: string;
  status: 'healthy' | 'error' | 'disabled';
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_record_count: number;
  consecutive_failures: number;
  consecutive_zero_runs: number;
  has_ever_produced_records: boolean;
  last_error: StructuredErrorInfo | null;
  updated_at: string;
}

export interface PerSourceRunStat {
  sourceKey: string;
  sourceName: string;
  state: string;
  county: string;
  status: 'healthy' | 'error';
  fetched: number;
  added: number;
  merged: number;
  rejected: number;
  error?: StructuredErrorInfo;
}

export interface ScanRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'partial_failure' | 'failed';
  leads_added: number;
  leads_updated: number;
  duplicates_merged: number;
  records_rejected: number;
  stale_flagged: number;
  high_score_alerts_sent: number;
  email_type_sent: 'daily_briefing' | 'error_report' | 'none';
  error_summary: string | null;
  per_source_stats: Record<string, PerSourceRunStat>;
}

export interface RejectedRecord {
  id: string;
  scan_run_id: string | null;
  source_id: string;
  county: string;
  state: string;
  reason: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

export interface RawLeadCandidate {
  parcelId?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  zip?: string | null;
  ownerName?: string | null;
  mailingAddress?: string | null;
  propertyType?: string | null;
  assessedValue?: number | null;
  taxDelinquentAmount?: number | null;
  auctionDate?: string | null;
  distressType?: DistressType | null;
  sourceId: string;
  sourceName: string;
  sourceUrl?: string | null;
  rawExcerpt?: string;
  enrichment?: LeadEnrichment;
}

export interface CountyConfig {
  id: string;
  state: string;
  county: string;
  enabled: boolean;
  adapters: string[];
  sourceConfig: Record<string, string | undefined>;
}

export interface CrossStateSourceItem {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface MasterConfig {
  version: number;
  description: string;
  crossStateSources: {
    govInventory: {
      enabled: boolean;
      sources: CrossStateSourceItem[];
    };
  };
  counties: CountyConfig[];
}

export interface LeadFilters {
  state?: string;
  county?: string;
  distressType?: DistressType | '';
  minScore?: number;
  status?: LeadStatus | '';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: 'motivation_score' | 'first_seen_at' | 'last_seen_at' | 'auction_date' | 'address' | 'county';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export interface DashboardSummary {
  newToday: number;
  totalActive: number;
  totalLeads: number;
  stale120Count: number;
  highScoreCount: number;
  byDistressType: Record<string, number>;
  byCounty: Array<{ state: string; county: string; count: number }>;
  sourceHealth: SourceHealth[];
  recentRuns: ScanRun[];
  top10: Lead[];
  demoMode: boolean;
}
