import * as cheerio from 'cheerio';
import { CountyConfig, Lead } from '../../types';
import { politeFetchText } from '../http-client';
import { EnrichmentAdapter, EnrichmentResult } from '../types';

/**
 * Georgia qPublic (qpublic.net / qpublic.schneidercorp.com) Assessor Enrichment Adapter
 * Enriches existing leads with owner name, mailing address, parcel ID, assessed value,
 * and absentee-owner flag from the county assessor page.
 */
export const gaQPublicEnrichmentAdapter: EnrichmentAdapter = {
  id: 'ga-qpublic-enrichment',
  name: 'Georgia qPublic County Assessor Enrichment',
  supportedStates: ['GA'],

  async enrichLead(lead: Lead, county: CountyConfig): Promise<EnrichmentResult | null> {
    const baseUrl = county.sourceConfig.qPublicBaseUrl;
    if (!baseUrl) return null;

    const queryKey = lead.parcel_id || lead.address;
    const lookupUrl = `${baseUrl}&KeyValue=${encodeURIComponent(queryKey)}`;

    const { text, finalUrl } = await politeFetchText(lookupUrl, {
      source: 'ga-qpublic-enrichment',
      county: county.county,
      state: county.state,
    });

    const $ = cheerio.load(text);

    const findField = (labelPattern: RegExp): string | null => {
      let found: string | null = null;
      $('tr').each((_, tr) => {
        if (found) return;
        const cells = $(tr).find('th, td');
        if (cells.length >= 2) {
          const label = $(cells[0]).text().trim();
          if (labelPattern.test(label)) {
            const val = $(cells[1]).text().replace(/\s+/g, ' ').trim();
            if (val) found = val;
          }
        }
      });
      return found;
    };

    const ownerName = findField(/^owner|owner name/i);
    const mailingAddress = findField(/mailing address/i);
    const parcelId = findField(/parcel\s*(id|number)/i) ?? lead.parcel_id;
    const assessedStr = findField(/(fair market|total assessed|appraised)\s*value/i);
    const yearBuiltStr = findField(/year built/i);
    const sqftStr = findField(/(heated|living|square)\s*(area|feet|ft)/i);
    const propertyType = findField(/(class|property type|land use)/i);

    const assessedValue = assessedStr
      ? Number(assessedStr.replace(/[^0-9.]/g, '')) || null
      : null;
    const yearBuilt = yearBuiltStr ? Number(yearBuiltStr.replace(/[^0-9]/g, '')) || undefined : undefined;
    const sqft = sqftStr ? Number(sqftStr.replace(/[^0-9]/g, '')) || undefined : undefined;

    if (!ownerName && !mailingAddress && !assessedValue && !yearBuilt) {
      return null;
    }

    const absenteeOwner = Boolean(
      mailingAddress &&
        !mailingAddress.toUpperCase().includes(lead.address.toUpperCase().slice(0, 10))
    );

    return {
      parcelId,
      ownerName,
      mailingAddress,
      assessedValue,
      propertyType,
      enrichment: {
        parcelUrl: finalUrl,
        yearBuilt,
        sqft,
        absenteeOwner,
        enrichmentSource: `${county.county} qPublic Assessor`,
      },
    };
  },
};
