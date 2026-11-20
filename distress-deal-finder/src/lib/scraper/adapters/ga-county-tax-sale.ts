import * as cheerio from 'cheerio';
import { CountyConfig, RawLeadCandidate } from '../../types';
import { AdapterShapeChangedError } from '../errors';
import { politeFetchText } from '../http-client';
import { SourceAdapter } from '../types';

function parseCurrency(text: string): number | null {
  const match = text.match(/\$([\d,]+(?:\.\d{2})?)/);
  if (!match) return null;
  const num = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

/**
 * Georgia County Tax Commissioner / Sheriff Tax-Sale Adapter
 * Reads the configured county tax-sale page (Fulton, DeKalb, Gwinnett, Cobb, Clayton)
 * and extracts scheduled tax-sale rows from HTML tables or structured list blocks.
 */
export const gaCountyTaxSaleAdapter: SourceAdapter = {
  id: 'ga-county-tax-sale',
  name: 'Georgia County Tax Sale Listings',
  supportedStates: ['GA'],

  async fetchCandidates(county: CountyConfig): Promise<RawLeadCandidate[]> {
    const taxSaleUrl = county.sourceConfig.taxSaleUrl;
    if (!taxSaleUrl) {
      throw new Error(`Missing sourceConfig.taxSaleUrl for ${county.state}:${county.county}`);
    }

    const { text, finalUrl } = await politeFetchText(taxSaleUrl, {
      source: 'ga-county-tax-sale',
      county: county.county,
      state: county.state,
    });

    const $ = cheerio.load(text);
    const pageText = $('body').text();
    if (!/tax\s*sale|delinquent|levy|sheriff/i.test(pageText)) {
      throw new AdapterShapeChangedError(
        `${county.county} County Tax Sale`,
        finalUrl,
        'tax sale / levy content marker'
      );
    }

    const candidates: RawLeadCandidate[] = [];

    // Parse HTML tables commonly published by GA county tax commissioners
    $('table tbody tr, .tax-sale-row, .levy-item').each((_, row) => {
      const $row = $(row);
      const rowText = $row.text().replace(/\s+/g, ' ').trim();
      const cells = $row
        .find('td')
        .map((__, td) => $(td).text().trim())
        .get();

      const addrMatch = rowText.match(
        /\b(\d{1,6}\s+[A-Za-z0-9\s.'-]{3,40}\s(?:St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Ln|Lane|Ct|Court|Cir|Circle|Blvd|Boulevard|Way|Pl|Place|Pkwy|Parkway|Trl|Trail|Ter|Terrace)\b(?:\s+(?:NE|NW|SE|SW|N|S|E|W))?)/i
      );
      if (!addrMatch) return;

      const parcelMatch = rowText.match(/\b([A-Z]?\d{2}[-\s]?\d{3,4}[-\s]?[A-Z0-9-]{2,12})\b/);
      const href = $row.find('a[href]').first().attr('href');
      const sourceUrl = href ? new URL(href, finalUrl).toString() : finalUrl;

      candidates.push({
        parcelId: parcelMatch?.[1] ?? null,
        address: addrMatch[1].trim(),
        county: county.county,
        state: 'GA',
        ownerName: cells[1] && cells[1].length > 3 && !/\d{3}/.test(cells[1]) ? cells[1] : null,
        taxDelinquentAmount: parseCurrency(rowText),
        distressType: 'tax_sale',
        sourceId: 'ga-county-tax-sale',
        sourceName: `${county.county} County Tax Sale List`,
        sourceUrl,
        rawExcerpt: rowText.slice(0, 300),
      });
    });

    return candidates;
  },
};
