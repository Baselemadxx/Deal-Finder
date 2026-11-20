import * as cheerio from 'cheerio';
import { CountyConfig, RawLeadCandidate } from '../../types';
import { AdapterShapeChangedError } from '../errors';
import { politeFetchText } from '../http-client';
import { SourceAdapter } from '../types';

/**
 * Florida RealForeclose Adapter (county.realforeclose.com)
 * Uniform foreclosure auction platform used by most Florida counties.
 * Ready to activate by enabling any FL county in config/counties.json.
 */
export const flRealForecloseAdapter: SourceAdapter = {
  id: 'fl-realforeclose',
  name: 'Florida RealForeclose Auction Platform',
  supportedStates: ['FL'],

  async fetchCandidates(county: CountyConfig): Promise<RawLeadCandidate[]> {
    const subdomain = county.sourceConfig.realForecloseSubdomain;
    if (!subdomain) {
      throw new Error(`Missing sourceConfig.realForecloseSubdomain for ${county.state}:${county.county}`);
    }

    const url = `https://${subdomain}/index.cfm?zaction=AUCTION&Zmethod=PREVIEW`;
    const { text, finalUrl } = await politeFetchText(url, {
      source: 'fl-realforeclose',
      county: county.county,
      state: 'FL',
    });

    const $ = cheerio.load(text);
    const hasMarker =
      /realforeclose|foreclosure|auction|clerk/i.test($('body').text()) &&
      $('.AUCTION_ITEM, #Area_W, .CALDAYBOX, table').length > 0;

    if (!hasMarker) {
      throw new AdapterShapeChangedError(
        `FL RealForeclose (${county.county})`,
        finalUrl,
        '.AUCTION_ITEM / RealForeclose calendar container'
      );
    }

    const candidates: RawLeadCandidate[] = [];
    $('.AUCTION_ITEM').each((_, el) => {
      const $el = $(el);
      const blockText = $el.text().replace(/\s+/g, ' ').trim();
      const addrMatch = blockText.match(
        /Property Address[:\s]+([0-9]+\s+[A-Za-z0-9\s.'-]+?)(?:\s+(?:Parcel|Final|Assessed|Plaintiff)|$)/i
      );
      if (!addrMatch) return;

      const parcelMatch = blockText.match(/Parcel\s*ID[:\s#]+([A-Z0-9-]{6,26})/i);
      const caseMatch = blockText.match(/Case\s*#[:\s]+([A-Z0-9-]+)/i);
      const dateMatch = blockText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      const href = $el.find('a[href]').first().attr('href');

      candidates.push({
        parcelId: parcelMatch?.[1] ?? null,
        address: addrMatch[1].trim(),
        county: county.county,
        state: 'FL',
        auctionDate: dateMatch?.[1] ?? null,
        distressType: 'foreclosure_auction',
        sourceId: 'fl-realforeclose',
        sourceName: `${county.county} FL RealForeclose`,
        sourceUrl: href ? new URL(href, `https://${subdomain}`).toString() : finalUrl,
        rawExcerpt: blockText.slice(0, 300),
        enrichment: caseMatch ? { caseNumber: caseMatch[1] } : undefined,
      });
    });

    return candidates;
  },
};
