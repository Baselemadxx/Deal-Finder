import * as cheerio from 'cheerio';
import { CountyConfig, DistressType, RawLeadCandidate } from '../../types';
import { AdapterShapeChangedError } from '../errors';
import { politeFetchText } from '../http-client';
import { SourceAdapter } from '../types';

const BASE_URL = 'https://www.georgiapublicnotice.com';

/**
 * Extracts a likely Georgia street address from legal notice body text.
 * Georgia non-judicial foreclosure notices typically state:
 * "commonly known as 1234 Peachtree St SW, Atlanta, GA 30310" or
 * "property address: 1234 Main St..."
 */
export function extractAddressFromNoticeText(text: string): {
  address: string | null;
  city: string | null;
  zip: string | null;
  parcelId: string | null;
  auctionDate: string | null;
} {
  const normalized = text.replace(/\s+/g, ' ').trim();

  const knownAsMatch = normalized.match(
    /(?:commonly known as|property address[:\s]+|located at|situated at)\s+(\d{1,6}\s+[A-Za-z0-9\s.'-]+?(?:St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Ln|Lane|Ct|Court|Cir|Circle|Blvd|Boulevard|Way|Pl|Place|Pkwy|Parkway|Trl|Trail|Ter|Terrace)\b(?:\s+(?:NE|NW|SE|SW|N|S|E|W))?)(?:,\s*([A-Za-z][A-Za-z\s.-]+?)(?:,\s*|\s+)(?:GA|Georgia)\b(?:\s+(\d{5}))?)?/i
  );

  let address = knownAsMatch?.[1]?.trim() ?? null;
  let city = knownAsMatch?.[2]?.trim() ?? null;
  let zip = knownAsMatch?.[3]?.trim() ?? null;

  if (!address) {
    const genericAddr = normalized.match(
      /\b(\d{2,6}\s+[A-Za-z0-9\s.'-]{3,40}\s(?:St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Ln|Lane|Ct|Court|Cir|Circle|Blvd|Boulevard|Way|Pl|Place|Pkwy|Parkway|Trl|Trail|Ter|Terrace)\b(?:\s+(?:NE|NW|SE|SW|N|S|E|W))?)/i
    );
    address = genericAddr?.[1]?.trim() ?? null;
  }

  const parcelMatch = normalized.match(
    /(?:parcel\s*(?:id|no\.?|number|#)?|tax\s*id|map\s*&\s*parcel)[:\s#]*([A-Z0-9-]{6,24})/i
  );
  const parcelId = parcelMatch?.[1]?.trim() ?? null;

  const saleDateMatch = normalized.match(
    /(?:first Tuesday in\s+([A-Za-z]+\s+\d{4})|sale\s+date[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})|(\d{1,2}\/\d{1,2}\/\d{4}))/i
  );
  const auctionDate = saleDateMatch?.[2] ?? saleDateMatch?.[3] ?? null;

  return { address, city, zip, parcelId, auctionDate };
}

async function fetchCategoryNotices(
  county: CountyConfig,
  category: 'Foreclosures' | 'Tax Sales',
  distressType: DistressType
): Promise<RawLeadCandidate[]> {
  const countyParam = encodeURIComponent(county.sourceConfig.gaPublicNoticeCountyName || county.county);
  const searchUrl = `${BASE_URL}/?county=${countyParam}&category=${encodeURIComponent(category)}`;

  const { text, finalUrl } = await politeFetchText(searchUrl, {
    source: 'ga-public-notice',
    county: county.county,
    state: county.state,
  });

  const $ = cheerio.load(text);

  // Verify expected page structure so silent HTML changes fail loudly
  const hasKnownShell =
    $('form[action*="georgiapublicnotice"], #search-results, .notice-list, .search-results, table.notices, [data-notice-id]').length >
      0 || /georgia public notice/i.test($('title').text());

  if (!hasKnownShell) {
    throw new AdapterShapeChangedError(
      'Georgia Public Notice',
      finalUrl,
      'georgiapublicnotice search shell / notice-list container'
    );
  }

  const candidates: RawLeadCandidate[] = [];
  const items = $('.notice-item, .search-result, table.notices tbody tr, [data-notice-id], article.notice');

  items.each((_, el) => {
    const $el = $(el);
    const bodyText = $el.text().replace(/\s+/g, ' ').trim();
    const href = $el.find('a[href]').first().attr('href');
    const sourceUrl = href ? new URL(href, BASE_URL).toString() : finalUrl;

    const extracted = extractAddressFromNoticeText(bodyText);
    if (!extracted.address) return;

    candidates.push({
      parcelId: extracted.parcelId,
      address: extracted.address,
      city: extracted.city,
      county: county.county,
      state: 'GA',
      zip: extracted.zip,
      auctionDate: extracted.auctionDate,
      distressType,
      sourceId: 'ga-public-notice',
      sourceName: `Georgia Public Notice (${category})`,
      sourceUrl,
      rawExcerpt: bodyText.slice(0, 320),
    });
  });

  return candidates;
}

export const gaPublicNoticeAdapter: SourceAdapter = {
  id: 'ga-public-notice',
  name: 'Georgia Public Notice (Foreclosures & Tax Sales)',
  supportedStates: ['GA'],

  async fetchCandidates(county: CountyConfig): Promise<RawLeadCandidate[]> {
    const [foreclosures, taxSales] = await Promise.all([
      fetchCategoryNotices(county, 'Foreclosures', 'pre_foreclosure'),
      fetchCategoryNotices(county, 'Tax Sales', 'tax_sale'),
    ]);
    return [...foreclosures, ...taxSales];
  },
};
