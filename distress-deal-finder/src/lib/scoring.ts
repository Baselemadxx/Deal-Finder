import { DISTRESS_TYPE_LABELS, DistressType, LeadEnrichment, ScoreBreakdownItem } from './types';

/**
 * Transparent Motivation Scoring Engine (0–100 scale)
 *
 * Every point awarded is explained in `score_breakdown` so the wholesaler
 * can see exactly why a property ranked high.
 *
 * Weights:
 * - Distress signals (base points per signal):
 *     foreclosure_auction : +40  (imminent courthouse / sheriff auction)
 *     tax_sale            : +38  (scheduled county tax sale)
 *     tax_deed            : +36  (tax deed auction)
 *     pre_foreclosure     : +35  (non-judicial notice / ~4 weeks to sale in GA)
 *     lis_pendens         : +30  (judicial foreclosure lawsuit filed)
 *     tax_delinquent      : +28  (delinquent property tax roll)
 *     gov_reo             : +22  (HUD / HomePath / HomeSteps / USDA inventory)
 *     stale_120_plus      : +20  (active 120+ days since first_seen_at)
 * - Signal Stacking Bonus:
 *     2 distinct signals  : +15
 *     3+ distinct signals : +25
 * - Auction Urgency Bonus:
 *     <= 14 days away     : +15
 *     15–30 days away     : +10
 * - Tax Delinquency Severity:
 *     >= $10,000 owed     : +10
 *     >= $3,000 owed      : +5
 * - Longevity Bonus:
 *     Active 60–119 days  : +5  (120+ days earns the stale_120_plus signal itself)
 * - Absentee Owner Bonus:
 *     Mailing != Property : +10
 */

export const DISTRESS_BASE_POINTS: Record<DistressType, number> = {
  foreclosure_auction: 40,
  tax_sale: 38,
  tax_deed: 36,
  pre_foreclosure: 35,
  lis_pendens: 30,
  tax_delinquent: 28,
  gov_reo: 22,
  stale_120_plus: 20,
};

export interface ScoringInput {
  distressTypes: DistressType[];
  auctionDate?: string | null;
  taxDelinquentAmount?: number | null;
  firstSeenAt: string;
  address?: string | null;
  mailingAddress?: string | null;
  enrichment?: LeadEnrichment | null;
  now?: Date;
}

export function calculateMotivationScore(input: ScoringInput): {
  score: number;
  breakdown: ScoreBreakdownItem[];
} {
  const now = input.now ?? new Date();
  const breakdown: ScoreBreakdownItem[] = [];
  const uniqueSignals = Array.from(new Set(input.distressTypes));

  // 1. Base points per distress type
  for (const signal of uniqueSignals) {
    const pts = DISTRESS_BASE_POINTS[signal] ?? 15;
    breakdown.push({
      label: DISTRESS_TYPE_LABELS[signal] ?? signal,
      points: pts,
      reason: `Active ${DISTRESS_TYPE_LABELS[signal] ?? signal} distress signal`,
    });
  }

  // 2. Signal stacking bonus
  if (uniqueSignals.length >= 3) {
    breakdown.push({
      label: '3+ Stacked Signals',
      points: 25,
      reason: `${uniqueSignals.length} independent distress signals stacked on the same property`,
    });
  } else if (uniqueSignals.length === 2) {
    breakdown.push({
      label: 'Stacked Signals (2x)',
      points: 15,
      reason: 'Two independent distress signals stacked on the same property',
    });
  }

  // 3. Auction urgency bonus
  if (input.auctionDate) {
    const auctionMs = new Date(input.auctionDate).getTime();
    if (!Number.isNaN(auctionMs)) {
      const daysUntilAuction = Math.ceil((auctionMs - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilAuction >= 0 && daysUntilAuction <= 14) {
        breakdown.push({
          label: 'Imminent Auction (<= 14d)',
          points: 15,
          reason: `Scheduled auction in ${daysUntilAuction} day${daysUntilAuction === 1 ? '' : 's'} (${input.auctionDate})`,
        });
      } else if (daysUntilAuction > 14 && daysUntilAuction <= 30) {
        breakdown.push({
          label: 'Upcoming Auction (<= 30d)',
          points: 10,
          reason: `Scheduled auction in ${daysUntilAuction} days (${input.auctionDate})`,
        });
      }
    }
  }

  // 4. Tax delinquency severity
  if (typeof input.taxDelinquentAmount === 'number' && input.taxDelinquentAmount > 0) {
    if (input.taxDelinquentAmount >= 10000) {
      breakdown.push({
        label: 'Severe Tax Delinquency',
        points: 10,
        reason: `$${input.taxDelinquentAmount.toLocaleString()} in delinquent property taxes (>= $10,000)`,
      });
    } else if (input.taxDelinquentAmount >= 3000) {
      breakdown.push({
        label: 'Notable Tax Delinquency',
        points: 5,
        reason: `$${input.taxDelinquentAmount.toLocaleString()} in delinquent property taxes (>= $3,000)`,
      });
    }
  }

  // 5. Days tracked longevity bonus (60-119 days; 120+ gets stale_120_plus signal)
  const firstSeenMs = new Date(input.firstSeenAt).getTime();
  if (!Number.isNaN(firstSeenMs)) {
    const daysTracked = Math.floor((now.getTime() - firstSeenMs) / (1000 * 60 * 60 * 24));
    if (daysTracked >= 60 && daysTracked < 120 && !uniqueSignals.includes('stale_120_plus')) {
      breakdown.push({
        label: '60+ Days Active',
        points: 5,
        reason: `Tracked as active for ${daysTracked} days without resolution`,
      });
    }
  }

  // 6. Absentee owner bonus
  const isAbsentee =
    input.enrichment?.absenteeOwner === true ||
    Boolean(
      input.mailingAddress &&
        input.address &&
        input.mailingAddress.trim().length > 5 &&
        !input.mailingAddress.toUpperCase().includes(input.address.trim().toUpperCase().slice(0, 12))
    );

  if (isAbsentee) {
    breakdown.push({
      label: 'Absentee Owner',
      points: 10,
      reason: 'Owner mailing address differs from property address',
    });
  }

  const rawTotal = breakdown.reduce((sum, item) => sum + item.points, 0);
  const score = Math.min(100, Math.max(0, rawTotal));

  return { score, breakdown };
}

/**
 * Checks whether an active lead has been tracked for 120+ days since first_seen_at.
 */
export function isEligibleForStale120(firstSeenAt: string, now: Date = new Date()): boolean {
  const ms = new Date(firstSeenAt).getTime();
  if (Number.isNaN(ms)) return false;
  const days = Math.floor((now.getTime() - ms) / (1000 * 60 * 60 * 24));
  return days >= 120;
}
