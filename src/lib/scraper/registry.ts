import { flClerkLisPendensAdapter } from './adapters/fl-clerk-lis-pendens';
import { flLienHubTaxAdapter } from './adapters/fl-lienhub-tax';
import { flRealForecloseAdapter } from './adapters/fl-realforeclose';
import { gaCountyTaxSaleAdapter } from './adapters/ga-county-tax-sale';
import { gaPublicNoticeAdapter } from './adapters/ga-public-notice';
import { gaQPublicEnrichmentAdapter } from './adapters/ga-qpublic-enrichment';
import { ohAuditorDelinquentTaxAdapter } from './adapters/oh-auditor-delinquent-tax';
import { ohSheriffSaleAdapter } from './adapters/oh-sheriff-sale';
import { EnrichmentAdapter, SourceAdapter } from './types';

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  'ga-public-notice': gaPublicNoticeAdapter,
  'ga-county-tax-sale': gaCountyTaxSaleAdapter,
  'oh-sheriff-sale': ohSheriffSaleAdapter,
  'oh-auditor-delinquent-tax': ohAuditorDelinquentTaxAdapter,
  'fl-realforeclose': flRealForecloseAdapter,
  'fl-clerk-lis-pendens': flClerkLisPendensAdapter,
  'fl-lienhub-tax': flLienHubTaxAdapter,
};

export const ENRICHMENT_ADAPTERS: Record<string, EnrichmentAdapter> = {
  'ga-qpublic-enrichment': gaQPublicEnrichmentAdapter,
};

export function getSourceAdapter(id: string): SourceAdapter | undefined {
  return SOURCE_ADAPTERS[id];
}

export function getEnrichmentAdapter(id: string): EnrichmentAdapter | undefined {
  return ENRICHMENT_ADAPTERS[id];
}
