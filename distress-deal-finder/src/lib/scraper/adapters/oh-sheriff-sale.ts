import * as cheerio from 'cheerio';
import { CountyConfig, RawLeadCandidate } from '../../types';
import { AdapterShapeChangedError } from '../errors';
import { politeFetchText } from '../http-client';
import { SourceAdapter } from '../types';

/**
 * Ohio Sheriff Sale Auction Adapter (sheriffsaleauction.ohio.gov)
 * Ready to activate by setting `enabled: true` on any Ohio county in config/counties.json.
 */
export const ohSheriffSaleAdapter: SourceAdapter = {
  id: 'oh-sheriff-sale',
  name: 'Ohio Sheriff Sale Auction Platform',
  supportedStates: ['OH'],

  async fetchCandidates(county: CountyConfig): Promise<RawLeadCandidate[]> {
    const subdomain = county.sourceConfig.sheriffSaleSubdomain;
    if (!subdomain) {
      throw new Error(`Missing sourceConfig.sheriffSaleSubdomain for ${county.state}:${county.county}`);
    }

    const url = `https://${subdomain}/index.cfm?zaction=AUCTION&Zmethod=PREVIEW`;
    const { text, finalUrl } = await politeFetchText(url, {
      source: 'oh-sheriff-sale',
      county: county.county,
      state: 'OH',
    });

    const $ = cheerio.load(text);
    const hasPlatformMarker =
      /sheriff|auction|foreclosure|realauction/i.test($('body').text()) &&
      $('.AUCTION_ITEM, .Head_C, #Area_W, table').length > 0;

    if (!hasPlatformMarker) {
      throw new AdapterShapeChangedError(
        `Ohio Sheriff Sale (${county.county})`,
        finalUrl,
        '.AUCTION_ITEM / RealAuction sheriff sale calendar shell'
      );
    }

    const candidates: RawLeadCandidate[] = [];
    $('.AUCTION_ITEM, tr.auction-row').each((_, el) => {
      const $el = $(el);
      const blockText = $el.text().replace(/\s+/g, ' ').trim();
      const addrMatch = blockText.match(
        /Property Address[:\s]+([0-9]+\s+[A-Za-z0-9\s.'-]+?)(?:\s+(?:Parcel|City|Appraised|Opening)|$)/i
      );
      if (!addrMatch) return;

      const parcelMatch = blockText.match(/Parcel(?:\s*ID)?[:\s#]+([A-Z0-9-]{5,24})/i);
      const dateMatch = blockText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      const href = $el.find('a[href]').first().attr('href');

      candidates.push({
        parcelId: parcelMatch?.[1] ?? null,
        address: addrMatch[1].trim(),
        county: county.county,
        state: 'OH',
        auctionDate: dateMatch?.[1] ?? null,
        distressType: 'foreclosure_auction',
        sourceId: 'oh-sheriff-sale',
        sourceName: `${county.county} OH Sheriff Sale Auction`,
        sourceUrl: href ? new URL(href, `https://${subdomain}`).toString() : finalUrl,
        rawExcerpt: blockText.slice(0, 300),
      });
    });

    return candidates;
  },
};
