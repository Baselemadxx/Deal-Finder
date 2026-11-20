import * as cheerio from 'cheerio';
import { CountyConfig, RawLeadCandidate } from '../../types';
import { AdapterShapeChangedError } from '../errors';
import { politeFetchText } from '../http-client';
import { SourceAdapter } from '../types';

/**
 * Florida County Clerk Official Records — Lis Pendens Adapter
 * Monitors county clerk public official records search for Lis Pendens filings.
 * Ready to activate by enabling an FL county in config/counties.json.
 */
export const flClerkLisPendensAdapter: SourceAdapter = {
  id: 'fl-clerk-lis-pendens',
  name: 'Florida County Clerk Lis Pendens Filings',
  supportedStates: ['FL'],

  async fetchCandidates(county: CountyConfig): Promise<RawLeadCandidate[]> {
    const url = county.sourceConfig.clerkOfficialRecordsUrl;
    if (!url) {
      throw new Error(`Missing sourceConfig.clerkOfficialRecordsUrl for ${county.state}:${county.county}`);
    }

    const { text, finalUrl } = await politeFetchText(url, {
      source: 'fl-clerk-lis-pendens',
      county: county.county,
      state: 'FL',
    });

    const $ = cheerio.load(text);
    if (!/official records|clerk|lis pendens|instrument|recording/i.test($('body').text())) {
      throw new AdapterShapeChangedError(
        `FL Clerk Official Records (${county.county})`,
        finalUrl,
        'Official Records search shell'
      );
    }

    const candidates: RawLeadCandidate[] = [];
    $('table tbody tr, .record-row').each((_, el) => {
      const $el = $(el);
      const rowText = $el.text().replace(/\s+/g, ' ').trim();
      if (!/lis\s*pendens|\bLP\b/i.test(rowText)) return;

      const addrMatch = rowText.match(
        /\b(\d{1,6}\s+[A-Za-z0-9\s.'-]{3,40}\s(?:St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Ln|Lane|Ct|Court|Blvd|Way|Pl|Pkwy|Ter)\b)/i
      );
      if (!addrMatch) return;

      const href = $el.find('a[href]').first().attr('href');
      candidates.push({
        address: addrMatch[1].trim(),
        county: county.county,
        state: 'FL',
        distressType: 'lis_pendens',
        sourceId: 'fl-clerk-lis-pendens',
        sourceName: `${county.county} FL Clerk Lis Pendens`,
        sourceUrl: href ? new URL(href, finalUrl).toString() : finalUrl,
        rawExcerpt: rowText.slice(0, 300),
      });
    });

    return candidates;
  },
};
