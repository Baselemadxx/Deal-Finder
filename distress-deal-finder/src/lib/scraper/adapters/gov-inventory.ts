import * as cheerio from 'cheerio';
import { CountyConfig, CrossStateSourceItem, RawLeadCandidate } from '../../types';
import { AdapterShapeChangedError } from '../errors';
import { politeFetchText } from '../http-client';

/**
 * Cross-State Government Inventory Adapter
 * Scans HUD Home Store, Fannie Mae HomePath, Freddie Mac HomeSteps, and USDA Resales
 * filtered to the currently active states/counties in config/counties.json.
 */
export async function fetchGovInventoryForSource(
  source: CrossStateSourceItem,
  activeCounties: CountyConfig[]
): Promise<RawLeadCandidate[]> {
  const activeStates = Array.from(new Set(activeCounties.map((c) => c.state.toUpperCase())));
  const activeCountyNames = new Map<string, Set<string>>();
  for (const c of activeCounties) {
    const st = c.state.toUpperCase();
    if (!activeCountyNames.has(st)) activeCountyNames.set(st, new Set());
    activeCountyNames.get(st)!.add(c.county.toLowerCase());
  }

  const { text, finalUrl } = await politeFetchText(source.url, {
    source: source.id,
    county: 'Statewide',
    state: activeStates.join(','),
  });

  const $ = cheerio.load(text);
  const bodyText = $('body').text();

  if (bodyText.trim().length < 200) {
    throw new AdapterShapeChangedError(
      source.name,
      finalUrl,
      'Non-empty HTML listing container (page may require JS or changed shape)'
    );
  }

  const candidates: RawLeadCandidate[] = [];
  $('.property-card, .listing-card, table tbody tr, [data-property-id]').each((_, el) => {
    const $el = $(el);
    const textBlock = $el.text().replace(/\s+/g, ' ').trim();

    const addrMatch = textBlock.match(
      /\b(\d{1,6}\s+[A-Za-z0-9\s.'-]{3,40}\s(?:St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Ln|Lane|Ct|Court|Cir|Blvd|Way|Pl|Pkwy)\b(?:\s+(?:NE|NW|SE|SW|N|S|E|W))?)/i
    );
    if (!addrMatch) return;

    const stateMatch = textBlock.match(/\b(GA|OH|FL)\b/);
    const state = stateMatch?.[1]?.toUpperCase();
    if (!state || !activeStates.includes(state)) return;

    // Match to an active county if mentioned, otherwise skip out-of-market properties
    const stateCounties = activeCountyNames.get(state);
    let matchedCounty: string | null = null;
    if (stateCounties) {
      for (const c of activeCounties.filter((ac) => ac.state === state)) {
        if (new RegExp(`\\b${c.county}\\b`, 'i').test(textBlock)) {
          matchedCounty = c.county;
          break;
        }
      }
    }
    if (!matchedCounty) return;

    const href = $el.find('a[href]').first().attr('href');
    const sourceUrl = href ? new URL(href, finalUrl).toString() : finalUrl;

    candidates.push({
      address: addrMatch[1].trim(),
      county: matchedCounty,
      state,
      distressType: 'gov_reo',
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl,
      rawExcerpt: textBlock.slice(0, 300),
    });
  });

  return candidates;
}
