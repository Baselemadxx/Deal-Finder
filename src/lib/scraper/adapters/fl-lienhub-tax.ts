import * as cheerio from 'cheerio';
import { CountyConfig, RawLeadCandidate } from '../../types';
import { AdapterShapeChangedError } from '../errors';
import { politeFetchText } from '../http-client';
import { SourceAdapter } from '../types';

/**
 * Florida LienHub Tax Certificate & RealAuction Tax Deed Sales Adapter
 * Ready to activate by enabling an FL county in config/counties.json.
 */
export const flLienHubTaxAdapter: SourceAdapter = {
  id: 'fl-lienhub-tax',
  name: 'Florida LienHub & RealAuction Tax Deed Sales',
  supportedStates: ['FL'],

  async fetchCandidates(county: CountyConfig): Promise<RawLeadCandidate[]> {
    const taxDeedSubdomain = county.sourceConfig.taxDeedSubdomain;
    const lienHubSlug = county.sourceConfig.lienHubCountySlug;

    if (!taxDeedSubdomain && !lienHubSlug) {
      throw new Error(
        `Missing sourceConfig.taxDeedSubdomain or lienHubCountySlug for ${county.state}:${county.county}`
      );
    }

    const candidates: RawLeadCandidate[] = [];

    if (taxDeedSubdomain) {
      const url = `https://${taxDeedSubdomain}/index.cfm?zaction=AUCTION&Zmethod=PREVIEW`;
      const { text, finalUrl } = await politeFetchText(url, {
        source: 'fl-lienhub-tax',
        county: county.county,
        state: 'FL',
      });

      const $ = cheerio.load(text);
      if (!/tax\s*deed|auction|realauction|realtaxdeed/i.test($('body').text())) {
        throw new AdapterShapeChangedError(
          `FL RealTaxDeed (${county.county})`,
          finalUrl,
          'RealTaxDeed auction container'
        );
      }

      $('.AUCTION_ITEM').each((_, el) => {
        const $el = $(el);
        const blockText = $el.text().replace(/\s+/g, ' ').trim();
        const addrMatch = blockText.match(
          /Property Address[:\s]+([0-9]+\s+[A-Za-z0-9\s.'-]+?)(?:\s+(?:Parcel|Opening|Assessed)|$)/i
        );
        if (!addrMatch) return;

        const parcelMatch = blockText.match(/Parcel\s*ID[:\s#]+([A-Z0-9-]{6,26})/i);
        const dateMatch = blockText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        const href = $el.find('a[href]').first().attr('href');

        candidates.push({
          parcelId: parcelMatch?.[1] ?? null,
          address: addrMatch[1].trim(),
          county: county.county,
          state: 'FL',
          auctionDate: dateMatch?.[1] ?? null,
          distressType: 'tax_deed',
          sourceId: 'fl-lienhub-tax',
          sourceName: `${county.county} FL Tax Deed Auction`,
          sourceUrl: href ? new URL(href, `https://${taxDeedSubdomain}`).toString() : finalUrl,
          rawExcerpt: blockText.slice(0, 300),
        });
      });
    }

    return candidates;
  },
};
