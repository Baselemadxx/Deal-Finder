import { CountyConfig, Lead, RawLeadCandidate } from '../types';

export interface SourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportedStates: string[];
  fetchCandidates(county: CountyConfig): Promise<RawLeadCandidate[]>;
}

export interface EnrichmentResult {
  parcelId?: string | null;
  ownerName?: string | null;
  mailingAddress?: string | null;
  assessedValue?: number | null;
  propertyType?: string | null;
  enrichment: Lead['enrichment'];
}

export interface EnrichmentAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportedStates: string[];
  enrichLead(lead: Lead, county: CountyConfig): Promise<EnrichmentResult | null>;
}
