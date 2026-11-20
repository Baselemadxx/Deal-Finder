import { DistressType, RawLeadCandidate } from './types';

const VALID_DISTRESS_TYPES = new Set<DistressType>([
  'pre_foreclosure',
  'foreclosure_auction',
  'tax_sale',
  'tax_delinquent',
  'lis_pendens',
  'tax_deed',
  'gov_reo',
  'stale_120_plus',
]);

const STREET_ABBREVIATIONS: Record<string, string> = {
  STREET: 'ST',
  AVENUE: 'AVE',
  ROAD: 'RD',
  DRIVE: 'DR',
  LANE: 'LN',
  COURT: 'CT',
  CIRCLE: 'CIR',
  BOULEVARD: 'BLVD',
  PARKWAY: 'PKWY',
  PLACE: 'PL',
  TERRACE: 'TER',
  TRAIL: 'TRL',
  WAY: 'WAY',
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHEAST: 'NE',
  NORTHWEST: 'NW',
  SOUTHEAST: 'SE',
  SOUTHWEST: 'SW',
};

export function normalizeAddress(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned
    .split(' ')
    .map((token) => STREET_ABBREVIATIONS[token] ?? token)
    .join(' ');
}

export function normalizeParcelId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

export function normalizeCounty(raw: string): string {
  return raw
    .trim()
    .replace(/\s+county$/i, '')
    .trim();
}

export function buildDedupeKey(input: {
  parcelId?: string | null;
  address: string;
  county: string;
  state: string;
}): string {
  const st = input.state.trim().toUpperCase();
  const cty = normalizeCounty(input.county).toUpperCase().replace(/\s+/g, '_');

  if (input.parcelId && normalizeParcelId(input.parcelId).length >= 4) {
    return `parcel:${st}:${cty}:${normalizeParcelId(input.parcelId)}`;
  }

  return `addr:${st}:${cty}:${normalizeAddress(input.address)}`;
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface ValidatedLeadCandidate {
  dedupeKey: string;
  parcelId: string | null;
  address: string;
  normalizedAddress: string;
  city: string | null;
  county: string;
  state: string;
  zip: string | null;
  ownerName: string | null;
  mailingAddress: string | null;
  propertyType: string | null;
  assessedValue: number | null;
  taxDelinquentAmount: number | null;
  auctionDate: string | null;
  distressType: DistressType;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  rawExcerpt?: string;
  enrichment?: RawLeadCandidate['enrichment'];
}

export type ValidationResult =
  | { valid: true; record: ValidatedLeadCandidate }
  | { valid: false; reason: string };

/**
 * Hard data-verification gate before any database insert.
 * Required fields: address, county, state, distressType, and a valid HTTP(S) sourceUrl.
 */
export function validateLeadCandidate(candidate: RawLeadCandidate): ValidationResult {
  const address = candidate.address?.trim() ?? '';
  if (address.length < 5 || !/\d/.test(address)) {
    return {
      valid: false,
      reason: `Missing or invalid street address: "${candidate.address ?? ''}"`,
    };
  }

  const county = candidate.county ? normalizeCounty(candidate.county) : '';
  if (!county) {
    return { valid: false, reason: 'Missing required field: county' };
  }

  const state = candidate.state?.trim().toUpperCase() ?? '';
  if (state.length !== 2 || !/^[A-Z]{2}$/.test(state)) {
    return { valid: false, reason: `Missing or invalid 2-letter state code: "${candidate.state ?? ''}"` };
  }

  if (!candidate.distressType || !VALID_DISTRESS_TYPES.has(candidate.distressType)) {
    return {
      valid: false,
      reason: `Missing or invalid distress type: "${candidate.distressType ?? ''}"`,
    };
  }

  const sourceUrl = candidate.sourceUrl?.trim() ?? '';
  if (!sourceUrl || !isValidHttpUrl(sourceUrl)) {
    return {
      valid: false,
      reason: `Missing or invalid source URL: "${candidate.sourceUrl ?? ''}"`,
    };
  }

  const parcelId = candidate.parcelId?.trim() || null;
  const normalizedAddress = normalizeAddress(address);
  const dedupeKey = buildDedupeKey({ parcelId, address, county, state });

  let auctionDate: string | null = null;
  if (candidate.auctionDate) {
    const parsedDate = new Date(candidate.auctionDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      auctionDate = parsedDate.toISOString().slice(0, 10);
    }
  }

  return {
    valid: true,
    record: {
      dedupeKey,
      parcelId,
      address,
      normalizedAddress,
      city: candidate.city?.trim() || null,
      county,
      state,
      zip: candidate.zip?.trim() || null,
      ownerName: candidate.ownerName?.trim() || null,
      mailingAddress: candidate.mailingAddress?.trim() || null,
      propertyType: candidate.propertyType?.trim() || null,
      assessedValue:
        typeof candidate.assessedValue === 'number' && Number.isFinite(candidate.assessedValue)
          ? candidate.assessedValue
          : null,
      taxDelinquentAmount:
        typeof candidate.taxDelinquentAmount === 'number' && Number.isFinite(candidate.taxDelinquentAmount)
          ? candidate.taxDelinquentAmount
          : null,
      auctionDate,
      distressType: candidate.distressType,
      sourceId: candidate.sourceId,
      sourceName: candidate.sourceName,
      sourceUrl,
      rawExcerpt: candidate.rawExcerpt,
      enrichment: candidate.enrichment,
    },
  };
}
