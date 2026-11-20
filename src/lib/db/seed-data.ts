import crypto from 'crypto';
import { calculateMotivationScore } from '../scoring';
import {
  DistressType,
  Lead,
  LeadHistoryEvent,
  ScanRun,
  SourceHealth,
} from '../types';
import { buildDedupeKey, normalizeAddress } from '../validation';

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

function daysFromNowDate(days: number): string {
  return new Date(Date.now() + days * 86400 * 1000).toISOString().slice(0, 10);
}

interface SeedSpec {
  address: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  parcelId: string | null;
  ownerName: string;
  mailingAddress: string;
  propertyType: string;
  assessedValue: number;
  taxDelinquentAmount: number | null;
  auctionDate: string | null;
  distressTypes: DistressType[];
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  firstSeenDaysAgo: number;
  lastSeenDaysAgo: number;
  status: Lead['status'];
  notes: string;
  skipTraceStatus: Lead['skip_trace_status'];
  skipTraceNotes: string;
  yearBuilt: number;
  sqft: number;
  beds: number;
  baths: number;
}

const DEMO_SPECS: SeedSpec[] = [
  {
    address: '1428 Sylvan Rd SW',
    city: 'Atlanta',
    county: 'Fulton',
    state: 'GA',
    zip: '30310',
    parcelId: '14-0106-0004-021-8',
    ownerName: 'ESTATE OF MARCUS HENDERSON',
    mailingAddress: '4902 Old National Hwy Apt 214, College Park, GA 30349',
    propertyType: 'Single Family Residential',
    assessedValue: 218400,
    taxDelinquentAmount: 14820,
    auctionDate: daysFromNowDate(11),
    distressTypes: ['pre_foreclosure', 'tax_delinquent', 'stale_120_plus'],
    sourceId: 'ga-public-notice',
    sourceName: 'Georgia Public Notice (Foreclosures)',
    sourceUrl: 'https://www.georgiapublicnotice.com/?county=Fulton&category=Foreclosures&ref=demo-fulton-001',
    firstSeenDaysAgo: 142,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'High-equity West End bungalow. Heir mailing address in College Park. Drive-by shows overgrown yard.',
    skipTraceStatus: 'in_progress',
    skipTraceNotes: 'Checked Fulton Probate online; identified two heirs. Ready for manual skip trace via TruePeopleSearch / county probate file.',
    yearBuilt: 1948,
    sqft: 1420,
    beds: 3,
    baths: 2,
  },
  {
    address: '3812 Glenwood Rd',
    city: 'Decatur',
    county: 'DeKalb',
    state: 'GA',
    zip: '30032',
    parcelId: '15-171-04-019',
    ownerName: 'DEKALB HERITAGE HOLDINGS LLC',
    mailingAddress: 'PO Box 45190, Atlanta, GA 30320',
    propertyType: 'Single Family Residential',
    assessedValue: 245900,
    taxDelinquentAmount: 11450,
    auctionDate: daysFromNowDate(11),
    distressTypes: ['tax_sale', 'pre_foreclosure'],
    sourceId: 'ga-county-tax-sale',
    sourceName: 'DeKalb County Tax Commissioner Sale List',
    sourceUrl: 'https://dekalbtax.org/tax-sale-listing#demo-dekalb-002',
    firstSeenDaysAgo: 18,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'Both on DeKalb tax sale levy list and non-judicial foreclosure notice for first Tuesday.',
    skipTraceStatus: 'not_started',
    skipTraceNotes: '',
    yearBuilt: 1962,
    sqft: 1680,
    beds: 3,
    baths: 2,
  },
  {
    address: '719 Oakview Dr SE',
    city: 'Marietta',
    county: 'Cobb',
    state: 'GA',
    zip: '30060',
    parcelId: '16-1235-0-042-0',
    ownerName: 'SANDRA L. PATTERSON',
    mailingAddress: '8820 Cypress Lake Dr, Fort Myers, FL 33919',
    propertyType: 'Single Family Residential',
    assessedValue: 294000,
    taxDelinquentAmount: 6240,
    auctionDate: daysFromNowDate(11),
    distressTypes: ['pre_foreclosure', 'tax_delinquent'],
    sourceId: 'ga-public-notice',
    sourceName: 'Georgia Public Notice (Foreclosures)',
    sourceUrl: 'https://www.georgiapublicnotice.com/?county=Cobb&category=Foreclosures&ref=demo-cobb-003',
    firstSeenDaysAgo: 0,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'Out-of-state absentee owner (Florida). Brand new notice posted today.',
    skipTraceStatus: 'not_started',
    skipTraceNotes: '',
    yearBuilt: 1974,
    sqft: 1850,
    beds: 4,
    baths: 2.5,
  },
  {
    address: '2156 Cruse Rd NW',
    city: 'Lawrenceville',
    county: 'Gwinnett',
    state: 'GA',
    zip: '30044',
    parcelId: 'R6142-088',
    ownerName: 'RAYMOND & TINA CHEN',
    mailingAddress: '2156 Cruse Rd NW, Lawrenceville, GA 30044',
    propertyType: 'Single Family Residential',
    assessedValue: 312500,
    taxDelinquentAmount: null,
    auctionDate: daysFromNowDate(11),
    distressTypes: ['pre_foreclosure'],
    sourceId: 'ga-public-notice',
    sourceName: 'Georgia Public Notice (Foreclosures)',
    sourceUrl: 'https://www.georgiapublicnotice.com/?county=Gwinnett&category=Foreclosures&ref=demo-gwinnett-004',
    firstSeenDaysAgo: 0,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'First-Tuesday foreclosure notice advertised in Gwinnett Daily Post.',
    skipTraceStatus: 'not_started',
    skipTraceNotes: '',
    yearBuilt: 1986,
    sqft: 2140,
    beds: 4,
    baths: 2.5,
  },
  {
    address: '6409 Tara Blvd',
    city: 'Jonesboro',
    county: 'Clayton',
    state: 'GA',
    zip: '30236',
    parcelId: '13-145B-A012',
    ownerName: 'SOUTH METRO RENTALS INC',
    mailingAddress: '1100 Peachtree St NE Ste 200, Atlanta, GA 30309',
    propertyType: 'Single Family Residential',
    assessedValue: 162000,
    taxDelinquentAmount: 9850,
    auctionDate: daysFromNowDate(11),
    distressTypes: ['tax_sale', 'stale_120_plus'],
    sourceId: 'ga-county-tax-sale',
    sourceName: 'Clayton County Tax Sale List',
    sourceUrl: 'https://www.claytoncountyga.gov/government/tax-commissioner/tax-sales/#demo-clayton-005',
    firstSeenDaysAgo: 131,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'Corporate absentee landlord; rolled over from prior tax sale list and now flagged Stale 120+.',
    skipTraceStatus: 'completed',
    skipTraceNotes: 'Looked up registered agent on GA Secretary of State eCorp portal; mailed direct postcard.',
    yearBuilt: 1969,
    sqft: 1290,
    beds: 3,
    baths: 1.5,
  },
  {
    address: '944 Cascade Ave SW',
    city: 'Atlanta',
    county: 'Fulton',
    state: 'GA',
    zip: '30311',
    parcelId: '14-0149-0002-077-3',
    ownerName: 'DERRICK W. COLEMAN',
    mailingAddress: '2840 Windy Hill Rd, Marietta, GA 30067',
    propertyType: 'Single Family Residential',
    assessedValue: 264000,
    taxDelinquentAmount: 4320,
    auctionDate: daysFromNowDate(25),
    distressTypes: ['pre_foreclosure', 'tax_delinquent'],
    sourceId: 'ga-public-notice',
    sourceName: 'Georgia Public Notice (Foreclosures)',
    sourceUrl: 'https://www.georgiapublicnotice.com/?county=Fulton&category=Foreclosures&ref=demo-fulton-006',
    firstSeenDaysAgo: 2,
    lastSeenDaysAgo: 0,
    status: 'contacted',
    notes: 'Left door hanger; owner lives in Marietta. High motivation.',
    skipTraceStatus: 'in_progress',
    skipTraceNotes: 'Cross-referencing Fulton qPublic deed book for co-owner.',
    yearBuilt: 1955,
    sqft: 1510,
    beds: 3,
    baths: 2,
  },
  {
    address: '4511 Rockbridge Rd',
    city: 'Stone Mountain',
    county: 'DeKalb',
    state: 'GA',
    zip: '30083',
    parcelId: '18-042-09-014',
    ownerName: 'HUD / SECRETARY OF HOUSING',
    mailingAddress: '451 7th St SW, Washington, DC 20410',
    propertyType: 'Single Family Residential',
    assessedValue: 231000,
    taxDelinquentAmount: null,
    auctionDate: null,
    distressTypes: ['gov_reo', 'stale_120_plus'],
    sourceId: 'gov-hud',
    sourceName: 'HUD Home Store',
    sourceUrl: 'https://www.hudhomestore.gov/Home/Index.aspx?case=105-449812',
    firstSeenDaysAgo: 128,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'HUD REO open to investor bids after owner-occupant exclusivity window expired.',
    skipTraceStatus: 'not_started',
    skipTraceNotes: 'Government REO — submit bid through HUD-registered broker, no owner skip trace required.',
    yearBuilt: 1978,
    sqft: 1620,
    beds: 3,
    baths: 2,
  },
  {
    address: '1890 Beaver Ruin Rd',
    city: 'Norcross',
    county: 'Gwinnett',
    state: 'GA',
    zip: '30093',
    parcelId: 'R6188-204',
    ownerName: 'CARLOS M. MENDOZA',
    mailingAddress: '3104 Buford Hwy NE, Brookhaven, GA 30329',
    propertyType: 'Townhome',
    assessedValue: 205000,
    taxDelinquentAmount: 5190,
    auctionDate: daysFromNowDate(11),
    distressTypes: ['tax_sale'],
    sourceId: 'ga-county-tax-sale',
    sourceName: 'Gwinnett County Tax Sale List',
    sourceUrl: 'https://gwinnetttaxcommissioner.publicaccessnow.com/PropertyTax/TaxSales.aspx#demo-gwinnett-008',
    firstSeenDaysAgo: 0,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'Added today from Gwinnett Tax Commissioner upcoming levy list.',
    skipTraceStatus: 'not_started',
    skipTraceNotes: '',
    yearBuilt: 1982,
    sqft: 1380,
    beds: 3,
    baths: 2.5,
  },
  {
    address: '520 Powder Springs St',
    city: 'Smyrna',
    county: 'Cobb',
    state: 'GA',
    zip: '30080',
    parcelId: '17-0522-0-011-0',
    ownerName: 'FANNIE MAE (HOMEPATH)',
    mailingAddress: '1100 15th St NW, Washington, DC 20005',
    propertyType: 'Single Family Residential',
    assessedValue: 338000,
    taxDelinquentAmount: null,
    auctionDate: null,
    distressTypes: ['gov_reo'],
    sourceId: 'gov-homepath',
    sourceName: 'Fannie Mae HomePath',
    sourceUrl: 'https://www.homepath.fanniemae.com/?property=demo-cobb-009',
    firstSeenDaysAgo: 14,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'Fannie Mae REO near Smyrna Market Village. Needs full cosmetic rehab.',
    skipTraceStatus: 'not_started',
    skipTraceNotes: '',
    yearBuilt: 1966,
    sqft: 1740,
    beds: 3,
    baths: 2,
  },
  {
    address: '8214 Highway 85',
    city: 'Riverdale',
    county: 'Clayton',
    state: 'GA',
    zip: '30274',
    parcelId: '13-212A-B009',
    ownerName: 'ANGELA D. BROOKS',
    mailingAddress: '8214 Highway 85, Riverdale, GA 30274',
    propertyType: 'Single Family Residential',
    assessedValue: 179500,
    taxDelinquentAmount: 3650,
    auctionDate: daysFromNowDate(11),
    distressTypes: ['pre_foreclosure'],
    sourceId: 'ga-public-notice',
    sourceName: 'Georgia Public Notice (Foreclosures)',
    sourceUrl: 'https://www.georgiapublicnotice.com/?county=Clayton&category=Foreclosures&ref=demo-clayton-010',
    firstSeenDaysAgo: 0,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'New foreclosure notice in Clayton News Daily.',
    skipTraceStatus: 'not_started',
    skipTraceNotes: '',
    yearBuilt: 1976,
    sqft: 1460,
    beds: 3,
    baths: 2,
  },
  {
    address: '2630 Delowe Dr',
    city: 'East Point',
    county: 'Fulton',
    state: 'GA',
    zip: '30344',
    parcelId: '14-0132-0006-044-2',
    ownerName: 'WILLIE MAE GRANT TRUST',
    mailingAddress: '1044 Oakridge Dr, Birmingham, AL 35215',
    propertyType: 'Single Family Residential',
    assessedValue: 189000,
    taxDelinquentAmount: 12100,
    auctionDate: null,
    distressTypes: ['tax_delinquent', 'stale_120_plus'],
    sourceId: 'ga-county-tax-sale',
    sourceName: 'Fulton County Tax Commissioner',
    sourceUrl: 'https://fultoncountytaxes.org/property-taxes/tax-sales/#demo-fulton-011',
    firstSeenDaysAgo: 155,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'Out-of-state trust owner in Alabama. Over $12k delinquent taxes and 155 days tracked.',
    skipTraceStatus: 'not_started',
    skipTraceNotes: '',
    yearBuilt: 1958,
    sqft: 1240,
    beds: 3,
    baths: 1,
  },
  {
    address: '3095 Panthersville Rd',
    city: 'Decatur',
    county: 'DeKalb',
    state: 'GA',
    zip: '30034',
    parcelId: '15-089-02-033',
    ownerName: 'KEVIN J. MORALES',
    mailingAddress: '3095 Panthersville Rd, Decatur, GA 30034',
    propertyType: 'Single Family Residential',
    assessedValue: 222000,
    taxDelinquentAmount: null,
    auctionDate: daysFromNowDate(25),
    distressTypes: ['pre_foreclosure'],
    sourceId: 'ga-public-notice',
    sourceName: 'Georgia Public Notice (Foreclosures)',
    sourceUrl: 'https://www.georgiapublicnotice.com/?county=DeKalb&category=Foreclosures&ref=demo-dekalb-012',
    firstSeenDaysAgo: 5,
    lastSeenDaysAgo: 0,
    status: 'active',
    notes: 'Owner-occupied pre-foreclosure; ~3.5 weeks before DeKalb courthouse steps.',
    skipTraceStatus: 'not_started',
    skipTraceNotes: '',
    yearBuilt: 1971,
    sqft: 1590,
    beds: 3,
    baths: 2,
  },
];

export function buildSeedDataset(): {
  leads: Lead[];
  history: LeadHistoryEvent[];
  sourceHealth: SourceHealth[];
  scanRuns: ScanRun[];
} {
  const nowIso = new Date().toISOString();
  const leads: Lead[] = [];
  const history: LeadHistoryEvent[] = [];

  for (const spec of DEMO_SPECS) {
    const id = crypto.randomUUID();
    const firstSeenAt = daysAgo(spec.firstSeenDaysAgo);
    const lastSeenAt = daysAgo(spec.lastSeenDaysAgo);
    const absenteeOwner = !spec.mailingAddress
      .toUpperCase()
      .includes(spec.address.toUpperCase().slice(0, 10));

    const enrichment = {
      parcelUrl: `https://qpublic.schneidercorp.com/?parcel=${encodeURIComponent(spec.parcelId || '')}`,
      yearBuilt: spec.yearBuilt,
      sqft: spec.sqft,
      beds: spec.beds,
      baths: spec.baths,
      absenteeOwner,
      enrichedAt: lastSeenAt,
      enrichmentSource: 'qPublic County Assessor',
    };

    const { score, breakdown } = calculateMotivationScore({
      distressTypes: spec.distressTypes,
      auctionDate: spec.auctionDate,
      taxDelinquentAmount: spec.taxDelinquentAmount,
      firstSeenAt,
      address: spec.address,
      mailingAddress: spec.mailingAddress,
      enrichment,
    });

    const lead: Lead = {
      id,
      dedupe_key: buildDedupeKey({
        parcelId: spec.parcelId,
        address: spec.address,
        county: spec.county,
        state: spec.state,
      }),
      parcel_id: spec.parcelId,
      address: spec.address,
      normalized_address: normalizeAddress(spec.address),
      city: spec.city,
      county: spec.county,
      state: spec.state,
      zip: spec.zip,
      owner_name: spec.ownerName,
      mailing_address: spec.mailingAddress,
      property_type: spec.propertyType,
      assessed_value: spec.assessedValue,
      tax_delinquent_amount: spec.taxDelinquentAmount,
      auction_date: spec.auctionDate,
      distress_types: spec.distressTypes,
      primary_distress_type: spec.distressTypes[0],
      source_url: spec.sourceUrl,
      source_name: spec.sourceName,
      sources: [
        {
          sourceId: spec.sourceId,
          sourceName: spec.sourceName,
          sourceUrl: spec.sourceUrl,
          distressType: spec.distressTypes[0],
          firstSeenAt,
          lastSeenAt,
          rawExcerpt: `Demo public notice record for ${spec.address}, ${spec.county} County, ${spec.state}.`,
        },
      ],
      enrichment,
      motivation_score: score,
      score_breakdown: breakdown,
      status: spec.status,
      notes: spec.notes,
      skip_trace_status: spec.skipTraceStatus,
      skip_trace_notes: spec.skipTraceNotes,
      first_seen_at: firstSeenAt,
      last_seen_at: lastSeenAt,
      created_at: firstSeenAt,
      updated_at: lastSeenAt,
    };

    leads.push(lead);

    history.push({
      id: crypto.randomUUID(),
      lead_id: id,
      event_type: 'created',
      details: {
        source: spec.sourceName,
        distressType: spec.distressTypes[0],
        initialScore: score,
      },
      created_at: firstSeenAt,
    });

    if (spec.distressTypes.includes('stale_120_plus')) {
      history.push({
        id: crypto.randomUUID(),
        lead_id: id,
        event_type: 'stale_flagged',
        details: {
          reason: 'Automatically flagged Stale 120+ after 120 days since first_seen_at',
        },
        created_at: daysAgo(Math.max(1, spec.firstSeenDaysAgo - 120)),
      });
    }

    if (spec.firstSeenDaysAgo > 0) {
      history.push({
        id: crypto.randomUUID(),
        lead_id: id,
        event_type: 'seen_again',
        details: {
          source: spec.sourceName,
          message: 'Confirmed still active during scheduled daily scan',
        },
        created_at: lastSeenAt,
      });
    }
  }

  const gaCounties = ['Fulton', 'DeKalb', 'Gwinnett', 'Cobb', 'Clayton'];
  const sourceHealth: SourceHealth[] = [];

  for (const county of gaCounties) {
    sourceHealth.push(
      {
        source_key: `ga-public-notice:GA:${county}`,
        source_id: 'ga-public-notice',
        source_name: 'Georgia Public Notice',
        state: 'GA',
        county,
        status: 'healthy',
        last_attempt_at: nowIso,
        last_success_at: nowIso,
        last_record_count: county === 'Fulton' ? 14 : 9,
        consecutive_failures: 0,
        consecutive_zero_runs: 0,
        has_ever_produced_records: true,
        last_error: null,
        updated_at: nowIso,
      },
      {
        source_key: `ga-county-tax-sale:GA:${county}`,
        source_id: 'ga-county-tax-sale',
        source_name: `${county} Tax Sale List`,
        state: 'GA',
        county,
        status: 'healthy',
        last_attempt_at: nowIso,
        last_success_at: nowIso,
        last_record_count: 6,
        consecutive_failures: 0,
        consecutive_zero_runs: 0,
        has_ever_produced_records: true,
        last_error: null,
        updated_at: nowIso,
      },
      {
        source_key: `ga-qpublic-enrichment:GA:${county}`,
        source_id: 'ga-qpublic-enrichment',
        source_name: `${county} qPublic Assessor`,
        state: 'GA',
        county,
        status: 'healthy',
        last_attempt_at: nowIso,
        last_success_at: nowIso,
        last_record_count: 5,
        consecutive_failures: 0,
        consecutive_zero_runs: 0,
        has_ever_produced_records: true,
        last_error: null,
        updated_at: nowIso,
      }
    );
  }

  sourceHealth.push({
    source_key: 'gov-inventory:ALL:ALL',
    source_id: 'gov-inventory',
    source_name: 'Gov Inventory (HUD / HomePath / HomeSteps / USDA)',
    state: 'GA',
    county: 'Statewide',
    status: 'healthy',
    last_attempt_at: nowIso,
    last_success_at: nowIso,
    last_record_count: 4,
    consecutive_failures: 0,
    consecutive_zero_runs: 0,
    has_ever_produced_records: true,
    last_error: null,
    updated_at: nowIso,
  });

  const scanRuns: ScanRun[] = [
    {
      id: crypto.randomUUID(),
      started_at: daysAgo(0),
      finished_at: nowIso,
      status: 'success',
      leads_added: 4,
      leads_updated: 8,
      duplicates_merged: 5,
      records_rejected: 2,
      stale_flagged: 1,
      high_score_alerts_sent: 2,
      email_type_sent: 'daily_briefing',
      error_summary: null,
      per_source_stats: {},
    },
    {
      id: crypto.randomUUID(),
      started_at: daysAgo(1),
      finished_at: daysAgo(1),
      status: 'success',
      leads_added: 3,
      leads_updated: 9,
      duplicates_merged: 4,
      records_rejected: 1,
      stale_flagged: 0,
      high_score_alerts_sent: 1,
      email_type_sent: 'daily_briefing',
      error_summary: null,
      per_source_stats: {},
    },
  ];

  return { leads, history, sourceHealth, scanRuns };
}
