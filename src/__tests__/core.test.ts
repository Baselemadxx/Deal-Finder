import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { deriveSessionToken, isAuthorizedRequest } from '../lib/auth';
import { isDemoMode } from '../lib/config';
import { LocalFileStore } from '../lib/db/local-store';
import { buildDailyBriefingEmail } from '../lib/email/templates';
import { extractAddressFromNoticeText } from '../lib/scraper/adapters/ga-public-notice';
import { calculateMotivationScore, isEligibleForStale120 } from '../lib/scoring';
import { buildDedupeKey, normalizeAddress, validateLeadCandidate } from '../lib/validation';

describe('Data Verification & Deduplication', () => {
  it('normalizes street addresses consistently', () => {
    expect(normalizeAddress('1428 Sylvan Road, SW.')).toBe('1428 SYLVAN RD SW');
    expect(normalizeAddress('1428  sylvan rd sw')).toBe('1428 SYLVAN RD SW');
  });

  it('deduplicates by parcel ID when available, otherwise by normalized address + county', () => {
    const k1 = buildDedupeKey({
      parcelId: '14-0106-0004-021-8',
      address: '1428 Sylvan Rd SW',
      county: 'Fulton County',
      state: 'ga',
    });
    const k2 = buildDedupeKey({
      parcelId: '14010600040218',
      address: '1428 Sylvan Road SW',
      county: 'Fulton',
      state: 'GA',
    });
    expect(k1).toBe(k2);
    expect(k1.startsWith('parcel:GA:FULTON:')).toBe(true);

    const kAddr = buildDedupeKey({
      parcelId: null,
      address: '1428 Sylvan Road SW',
      county: 'Fulton',
      state: 'GA',
    });
    expect(kAddr).toBe('addr:GA:FULTON:1428 SYLVAN RD SW');
  });

  it('rejects records missing required fields or valid source URL', () => {
    const missingUrl = validateLeadCandidate({
      address: '1428 Sylvan Rd SW',
      county: 'Fulton',
      state: 'GA',
      distressType: 'pre_foreclosure',
      sourceId: 'ga-public-notice',
      sourceName: 'GA Public Notice',
      sourceUrl: 'not-a-url',
    });
    expect(missingUrl.valid).toBe(false);

    const missingAddress = validateLeadCandidate({
      address: '',
      county: 'Fulton',
      state: 'GA',
      distressType: 'pre_foreclosure',
      sourceId: 'ga-public-notice',
      sourceName: 'GA Public Notice',
      sourceUrl: 'https://www.georgiapublicnotice.com/notice/123',
    });
    expect(missingAddress.valid).toBe(false);

    const valid = validateLeadCandidate({
      address: '1428 Sylvan Rd SW',
      county: 'Fulton',
      state: 'GA',
      distressType: 'pre_foreclosure',
      sourceId: 'ga-public-notice',
      sourceName: 'GA Public Notice',
      sourceUrl: 'https://www.georgiapublicnotice.com/notice/123',
    });
    expect(valid.valid).toBe(true);
  });
});

describe('Transparent Motivation Scoring & Stale 120+', () => {
  it('awards stacked signal bonus, auction urgency, tax severity, and absentee bonus', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const result = calculateMotivationScore({
      distressTypes: ['pre_foreclosure', 'tax_delinquent'],
      auctionDate: '2026-12-01',
      taxDelinquentAmount: 12000,
      firstSeenAt: '2026-11-01T12:00:00Z',
      address: '1428 Sylvan Rd SW',
      mailingAddress: '4902 Old National Hwy, College Park, GA 30349',
      now,
    });

    // 35 (pre_foreclosure) + 28 (tax_delinquent) + 15 (2x stack) + 15 (<=14d auction) + 10 (>=10k tax) + 10 (absentee) = 113 -> capped at 100
    expect(result.score).toBe(100);
    expect(result.breakdown.some((b) => b.label === 'Stacked Signals (2x)')).toBe(true);
    expect(result.breakdown.some((b) => b.label === 'Absentee Owner')).toBe(true);
  });

  it('flags active leads as eligible for Stale 120+ after 120 days', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    expect(isEligibleForStale120('2026-07-01T00:00:00Z', now)).toBe(true);
    expect(isEligibleForStale120('2026-10-01T00:00:00Z', now)).toBe(false);
  });
});

describe('Georgia Public Notice Text Parser', () => {
  it('extracts street address, city, zip, and parcel ID from legal notice text', () => {
    const sample =
      'NOTICE OF SALE UNDER POWER GEORGIA, FULTON COUNTY. Property commonly known as 1428 Sylvan Rd SW, Atlanta, GA 30310. Parcel ID: 14-0106-0004-021-8. Sale Date: 12/01/2026.';
    const parsed = extractAddressFromNoticeText(sample);
    expect(parsed.address).toBe('1428 Sylvan Rd SW');
    expect(parsed.city).toBe('Atlanta');
    expect(parsed.zip).toBe('30310');
    expect(parsed.parcelId).toBe('14-0106-0004-021-8');
    expect(parsed.auctionDate).toBe('12/01/2026');
  });
});

describe('LocalFileStore Persistence, Merge & History', () => {
  it('merges duplicate properties without overwriting history and stacks new signals', async () => {
    const tmpFile = path.join(os.tmpdir(), `ddf-test-${Date.now()}.json`);
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ leads: [], history: [], sourceHealth: [], scanRuns: [], rejectedRecords: [] })
    );

    const store = new LocalFileStore(tmpFile);
    const v1 = validateLeadCandidate({
      parcelId: '14-0106-0004-021-8',
      address: '1428 Sylvan Rd SW',
      county: 'Fulton',
      state: 'GA',
      distressType: 'pre_foreclosure',
      sourceId: 'ga-public-notice',
      sourceName: 'Georgia Public Notice',
      sourceUrl: 'https://www.georgiapublicnotice.com/notice/1',
    });
    expect(v1.valid).toBe(true);
    if (!v1.valid) return;

    const r1 = await store.upsertValidatedLead(v1.record, '2026-05-01T12:00:00.000Z');
    expect(r1.action).toBe('inserted');

    const v2 = validateLeadCandidate({
      parcelId: '14-0106-0004-021-8',
      address: '1428 Sylvan Road SW',
      county: 'Fulton',
      state: 'GA',
      distressType: 'tax_sale',
      sourceId: 'ga-county-tax-sale',
      sourceName: 'Fulton Tax Sale',
      sourceUrl: 'https://fultoncountytaxes.org/tax-sales/1',
    });
    expect(v2.valid).toBe(true);
    if (!v2.valid) return;

    const r2 = await store.upsertValidatedLead(v2.record, '2026-11-20T12:00:00.000Z');
    expect(r2.action).toBe('merged');
    expect(r2.newSignalAdded).toBe(true);
    expect(r2.lead.distress_types).toEqual(['pre_foreclosure', 'tax_sale']);
    expect(r2.lead.first_seen_at).toBe('2026-05-01T12:00:00.000Z');

    const staleFlagged = await store.flagStale120Leads('2026-11-20T12:00:00.000Z');
    expect(staleFlagged).toBe(1);

    const fetched = await store.getLeadById(r1.lead.id);
    expect(fetched?.lead.distress_types).toContain('stale_120_plus');
    expect(fetched?.history.length).toBe(3); // created, signal_added, stale_flagged

    fs.unlinkSync(tmpFile);
  });

  it('tracks silent-zero streaks after a source previously produced records', async () => {
    const tmpFile = path.join(os.tmpdir(), `ddf-zero-${Date.now()}.json`);
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ leads: [], history: [], sourceHealth: [], scanRuns: [], rejectedRecords: [] })
    );
    const store = new LocalFileStore(tmpFile);

    await store.recordSourceHealthSuccess({
      sourceKey: 'ga-public-notice:GA:Fulton',
      sourceId: 'ga-public-notice',
      sourceName: 'Georgia Public Notice',
      state: 'GA',
      county: 'Fulton',
      recordCount: 10,
      nowIso: '2026-11-17T11:00:00Z',
    });

    for (const ts of ['2026-11-18T11:00:00Z', '2026-11-19T11:00:00Z', '2026-11-20T11:00:00Z']) {
      await store.recordSourceHealthSuccess({
        sourceKey: 'ga-public-notice:GA:Fulton',
        sourceId: 'ga-public-notice',
        sourceName: 'Georgia Public Notice',
        state: 'GA',
        county: 'Fulton',
        recordCount: 0,
        nowIso: ts,
      });
    }

    const health = await store.getSourceHealth();
    expect(health[0].has_ever_produced_records).toBe(true);
    expect(health[0].consecutive_zero_runs).toBe(3);

    const summary = await store.getDashboardSummary();
    const email = buildDailyBriefingEmail(summary, {
      dateLabel: '2026-11-20',
      leadsAdded: 0,
      duplicatesMerged: 0,
      recordsRejected: 0,
      staleFlagged: 0,
      highScoreAlertsSent: 0,
      perSourceStats: [],
      failedSources: [
        {
          sourceName: 'Test Failing Source',
          county: 'Cobb',
          state: 'GA',
          errorMessage: 'HTTP 403',
          lastSuccessAt: null,
        },
      ],
      enrichmentStats: { attempted: 5, succeeded: 0, failed: 5 },
    });

    expect(email.text).toContain('SOURCE FAILURES:');
    expect(email.text).toContain('SILENT-ZERO WARNINGS');
    expect(email.text).toContain('Enrichment fully failing this run (5/5 failed');

    fs.unlinkSync(tmpFile);
  });
});

describe('CI Safety & Auth Protection', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('fails loudly in GitHub Actions CI when Supabase secrets are missing and DEMO_MODE is not true', () => {
    process.env.GITHUB_ACTIONS = 'true';
    delete process.env.DEMO_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => isDemoMode()).toThrow(/CI safety check failed/);
  });

  it('rejects unauthenticated requests and accepts valid Bearer or signed cookie', async () => {
    const secret = 'super-secret-dashboard-token';
    expect(await isAuthorizedRequest({ secret })).toBe(false);
    expect(await isAuthorizedRequest({ authHeader: 'Bearer wrong', secret })).toBe(false);
    expect(await isAuthorizedRequest({ authHeader: `Bearer ${secret}`, secret })).toBe(true);

    const cookie = await deriveSessionToken(secret);
    expect(await isAuthorizedRequest({ cookieValue: cookie, secret })).toBe(true);
    expect(await isAuthorizedRequest({ cookieValue: 'tampered', secret })).toBe(false);
  });
});
