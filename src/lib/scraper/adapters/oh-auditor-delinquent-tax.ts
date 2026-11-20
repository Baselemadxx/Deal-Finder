import * as cheerio from 'cheerio';
import { CountyConfig, RawLeadCandidate } from '../../types';
import { AdapterShapeChangedError } from '../errors';
import { politeFetchText } from '../http-client';
import { SourceAdapter } from '../types';

/**
 * Ohio County Auditor / Treasurer Delinquent Tax List Adapter
 * Ohio counties publish delinquent real estate tax lists roughly twice a year.
 * Ready to activate by enabling an OH county in config/counties.json.
 */
export const ohAuditorDelinquentTaxAdapter: SourceAdapter = {
  id: 'oh-auditor-delinquent-tax',
  name: 'Ohio County Auditor Delinquent Tax List',
  supportedStates: ['OH'],

  async fetchCandidates(county: CountyConfig): Promise<RawLeadCandidate[]> {
    const url = county.sourceConfig.delinquentTaxUrl;
    if (!url) {
      throw new Error(`Missing sourceConfig.delinquentTaxUrl for ${county.state}:${county.county}`);
    }

    const { text, finalUrl } = await politeFetchText(url, {
      source: 'oh-auditor-delinquent-tax',
      county: county.county,
      state: 'OH',
    });

    const $ = cheerio.load(text);
    if (!/delinquent|tax|parcel|auditor|treasurer/i.test($('body').text())) {
      throw new AdapterShapeChangedError(
        `Ohio Delinquent Tax (${county.county})`,
        finalUrl,
        'delinquent tax table / parcel list'
      );
    }

    const candidates: RawLeadCandidate[] = [];
    $('table tbody tr').each((_, row) => {
      const $row = $(row);
      const rowText = $row.text().replace(/\s+/g, ' ').trim();
      const addrMatch = rowText.match(
        /\b(\d{1,6}\s+[A-Za-z0-9\s.'-]{3,40}\s(?:St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Ln|Lane|Ct|Court|Blvd|Way|Pl|Pkwy)\b)/i
      );
      if (!addrMatch) return;

      const parcelMatch = rowText.match(/\b(\d{3}-\d{6}-\d{2}|\d{3}-\d{2}-\d{3})\b/);
      const taxMatch = rowText.match(/\$([\d,]+(?:\.\d{2})?)/);
      const href = $row.find('a[href]').first().attr('href');

      candidates.push({
        parcelId: parcelMatch?.[1] ?? null,
        address: addrMatch[1].trim(),
        county: county.county,
        state: 'OH',
        taxDelinquentAmount: taxMatch ? Number(taxMatch[1].replace(/,/g, '')) : null,
        distressType: 'tax_delinquent',
        sourceId: 'oh-auditor-delinquent-tax',
        sourceName: `${county.county} OH Delinquent Tax Roll`,
        sourceUrl: href ? new URL(href, finalUrl).toString() : finalUrl,
        rawExcerpt: rowText.slice(0, 300),
      });
    });

    return candidates;
  },
};
