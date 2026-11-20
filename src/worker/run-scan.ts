import { getActiveCounties, getHighScoreThreshold, loadMasterConfig } from '../lib/config';
import { getDb } from '../lib/db';
import { sendEmail } from '../lib/email/mailer';
import {
  buildDailyBriefingEmail,
  buildHighScoreLeadAlertEmail,
  FailedSourceForEmail,
  RunMetricsForEmail,
} from '../lib/email/templates';
import { logger, toStructuredError } from '../lib/logger';
import { fetchGovInventoryForSource } from '../lib/scraper/adapters/gov-inventory';
import { getEnrichmentAdapter, getSourceAdapter } from '../lib/scraper/registry';
import { Lead, PerSourceRunStat, RawLeadCandidate } from '../lib/types';
import { validateLeadCandidate } from '../lib/validation';

async function main() {
  const nowIso = new Date().toISOString();
  const dateLabel = nowIso.slice(0, 10);
  const dryRun = process.env.DRY_RUN === 'true';
  const highScoreThreshold = getHighScoreThreshold();
  const db = getDb();

  logger.info('Starting autonomous daily distress scan', {
    source: 'worker',
    dryRun,
    highScoreThreshold,
  });

  const scanRun = dryRun ? null : await db.startScanRun(nowIso);
  const perSourceStats: Record<string, PerSourceRunStat> = {};
  const failedSources: FailedSourceForEmail[] = [];

  let leadsAdded = 0;
  let leadsUpdated = 0;
  let duplicatesMerged = 0;
  let recordsRejected = 0;
  let staleFlagged = 0;
  let highScoreAlertsSent = 0;
  let enrichmentAttempted = 0;
  let enrichmentSucceeded = 0;
  let enrichmentFailed = 0;
  let fatalError: string | undefined;

  const newLeadsForEnrichment: Array<{ lead: Lead; countyId: string }> = [];

  async function processCandidates(
    candidates: RawLeadCandidate[],
    meta: { sourceKey: string; sourceId: string; sourceName: string; state: string; county: string; countyId?: string }
  ) {
    let added = 0;
    let merged = 0;
    let rejected = 0;

    for (const candidate of candidates) {
      const validation = validateLeadCandidate(candidate);
      if (!validation.valid) {
        rejected++;
        recordsRejected++;
        logger.warn(`Rejected incomplete record: ${validation.reason}`, {
          source: meta.sourceId,
          county: meta.county,
          state: meta.state,
        });
        if (!dryRun) {
          await db.logRejectedRecord({
            scanRunId: scanRun?.id ?? null,
            sourceId: meta.sourceId,
            county: meta.county,
            state: meta.state,
            reason: validation.reason,
            rawPayload: candidate as unknown as Record<string, unknown>,
            nowIso,
          });
        }
        continue;
      }

      if (dryRun) {
        added++;
        leadsAdded++;
        continue;
      }

      const outcome = await db.upsertValidatedLead(validation.record, nowIso);
      if (outcome.action === 'inserted') {
        added++;
        leadsAdded++;
        if (meta.countyId) {
          newLeadsForEnrichment.push({ lead: outcome.lead, countyId: meta.countyId });
        }
        if (outcome.lead.motivation_score >= highScoreThreshold) {
          try {
            await sendEmail(buildHighScoreLeadAlertEmail(outcome.lead));
            highScoreAlertsSent++;
          } catch (mailErr) {
            logger.error(
              'Failed sending immediate high-score lead alert',
              { source: 'mailer', county: outcome.lead.county, state: outcome.lead.state },
              mailErr
            );
          }
        }
      } else {
        merged++;
        duplicatesMerged++;
        leadsUpdated++;
      }
    }

    perSourceStats[meta.sourceKey] = {
      sourceKey: meta.sourceKey,
      sourceName: meta.sourceName,
      state: meta.state,
      county: meta.county,
      status: 'healthy',
      fetched: candidates.length,
      added,
      merged,
      rejected,
    };

    if (!dryRun) {
      await db.recordSourceHealthSuccess({
        sourceKey: meta.sourceKey,
        sourceId: meta.sourceId,
        sourceName: meta.sourceName,
        state: meta.state,
        county: meta.county,
        recordCount: candidates.length,
        nowIso,
      });
    }
  }

  try {
    const masterConfig = loadMasterConfig();
    const activeCounties = getActiveCounties();
    const existingHealth = await db.getSourceHealth();
    const healthByKey = new Map(existingHealth.map((h) => [h.source_key, h]));

    // 1. Run per-county source adapters
    for (const county of activeCounties) {
      for (const adapterId of county.adapters) {
        const sourceAdapter = getSourceAdapter(adapterId);
        if (!sourceAdapter) continue; // Enrichment adapters run in step 3

        const sourceKey = `${adapterId}:${county.state}:${county.county}`;
        try {
          logger.info(`Running adapter ${adapterId}`, {
            source: adapterId,
            county: county.county,
            state: county.state,
          });
          const candidates = await sourceAdapter.fetchCandidates(county);
          await processCandidates(candidates, {
            sourceKey,
            sourceId: adapterId,
            sourceName: sourceAdapter.name,
            state: county.state,
            county: county.county,
            countyId: county.id,
          });
        } catch (err) {
          const structured = toStructuredError(err, {
            source: adapterId,
            county: county.county,
            state: county.state,
          });
          logger.error(
            structured.message,
            {
              source: adapterId,
              county: county.county,
              state: county.state,
            },
            err
          );

          perSourceStats[sourceKey] = {
            sourceKey,
            sourceName: sourceAdapter.name,
            state: county.state,
            county: county.county,
            status: 'error',
            fetched: 0,
            added: 0,
            merged: 0,
            rejected: 0,
            error: structured,
          };

          const prevHealth = healthByKey.get(sourceKey);
          failedSources.push({
            sourceName: sourceAdapter.name,
            county: county.county,
            state: county.state,
            errorMessage: structured.message,
            stack: structured.stack,
            lastSuccessAt: prevHealth?.last_success_at ?? null,
          });

          if (!dryRun) {
            await db.recordSourceHealthError({
              sourceKey,
              sourceId: adapterId,
              sourceName: sourceAdapter.name,
              state: county.state,
              county: county.county,
              error: structured,
              nowIso,
            });
          }
        }
      }
    }

    // 2. Run cross-state government inventory adapters (only if enabled in config)
    if (masterConfig.crossStateSources.govInventory.enabled) {
      for (const govSrc of masterConfig.crossStateSources.govInventory.sources.filter((s) => s.enabled)) {
        const sourceKey = `${govSrc.id}:ALL:Statewide`;
        try {
          logger.info(`Running cross-state gov inventory adapter ${govSrc.id}`, {
            source: govSrc.id,
            county: 'Statewide',
            state: 'ALL',
          });
          const candidates = await fetchGovInventoryForSource(govSrc, activeCounties);
          await processCandidates(candidates, {
            sourceKey,
            sourceId: govSrc.id,
            sourceName: govSrc.name,
            state: activeCounties[0]?.state ?? 'GA',
            county: 'Statewide',
          });
        } catch (err) {
          const structured = toStructuredError(err, {
            source: govSrc.id,
            county: 'Statewide',
            state: 'ALL',
          });
          logger.error(structured.message, { source: govSrc.id, county: 'Statewide', state: 'ALL' }, err);

          perSourceStats[sourceKey] = {
            sourceKey,
            sourceName: govSrc.name,
            state: 'ALL',
            county: 'Statewide',
            status: 'error',
            fetched: 0,
            added: 0,
            merged: 0,
            rejected: 0,
            error: structured,
          };

          failedSources.push({
            sourceName: govSrc.name,
            county: 'Statewide',
            state: 'ALL',
            errorMessage: structured.message,
            stack: structured.stack,
            lastSuccessAt: healthByKey.get(sourceKey)?.last_success_at ?? null,
          });

          if (!dryRun) {
            await db.recordSourceHealthError({
              sourceKey,
              sourceId: govSrc.id,
              sourceName: govSrc.name,
              state: 'ALL',
              county: 'Statewide',
              error: structured,
              nowIso,
            });
          }
        }
      }
    }

    // 3. Enrich newly ingested leads via county assessor adapters (e.g., qPublic)
    // Note: qPublic returns HTTP 403 from datacenter IPs; 100% failure is surfaced in the briefing.
    if (!dryRun && newLeadsForEnrichment.length > 0) {
      const countyMap = new Map(activeCounties.map((c) => [c.id, c]));
      for (const item of newLeadsForEnrichment.slice(0, 25)) {
        const county = countyMap.get(item.countyId);
        if (!county) continue;
        for (const adapterId of county.adapters) {
          const enrichAdapter = getEnrichmentAdapter(adapterId);
          if (!enrichAdapter) continue;
          enrichmentAttempted++;
          try {
            const enriched = await enrichAdapter.enrichLead(item.lead, county);
            if (enriched) {
              await db.applyLeadEnrichment(item.lead.id, enriched, nowIso);
              enrichmentSucceeded++;
            } else {
              enrichmentFailed++;
            }
          } catch (err) {
            enrichmentFailed++;
            logger.warn(`Enrichment failed for ${item.lead.address}: ${String(err)}`, {
              source: adapterId,
              county: county.county,
              state: county.state,
            });
          }
        }
      }
    }

    // 4. Flag any active leads tracked 120+ days since first_seen_at as "Stale 120+"
    if (!dryRun) {
      staleFlagged = await db.flagStale120Leads(nowIso);
    }
  } catch (err) {
    fatalError = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    logger.error('Fatal error during daily scan', { source: 'worker' }, err);
  }

  // 5. Always send ONE daily briefing email (including any source failures & silent-zero warnings),
  //    AND always finalize scan_runs even if sending the email throws (FIX 3 & FIX 8).
  const metrics: RunMetricsForEmail = {
    dateLabel,
    leadsAdded,
    duplicatesMerged,
    recordsRejected,
    staleFlagged,
    highScoreAlertsSent,
    perSourceStats: Object.values(perSourceStats),
    failedSources,
    fatalError,
    enrichmentStats: {
      attempted: enrichmentAttempted,
      succeeded: enrichmentSucceeded,
      failed: enrichmentFailed,
    },
  };

  let emailTypeSent: 'daily_briefing' | 'error_report' | 'none' = 'none';
  let emailError: unknown = null;

  try {
    const summary = await db.getDashboardSummary();
    await sendEmail(buildDailyBriefingEmail(summary, metrics));
    emailTypeSent = 'daily_briefing';
  } catch (mailErr) {
    emailError = mailErr;
    logger.error('CRITICAL: Failed to send daily briefing email', { source: 'mailer' }, mailErr);
  }

  if (!dryRun && scanRun) {
    const emailErrMsg = emailError
      ? `Email send failed: ${emailError instanceof Error ? emailError.message : String(emailError)}`
      : null;

    const combinedErrorSummary =
      [
        fatalError,
        failedSources.length > 0 ? `${failedSources.length} source(s) failed` : null,
        emailErrMsg,
      ]
        .filter(Boolean)
        .join(' | ') || null;

    await db.finishScanRun(scanRun.id, {
      finished_at: new Date().toISOString(),
      status:
        fatalError || emailError
          ? 'failed'
          : failedSources.length > 0
            ? 'partial_failure'
            : 'success',
      leads_added: leadsAdded,
      leads_updated: leadsUpdated,
      duplicates_merged: duplicatesMerged,
      records_rejected: recordsRejected,
      stale_flagged: staleFlagged,
      high_score_alerts_sent: highScoreAlertsSent,
      email_type_sent: emailTypeSent,
      error_summary: combinedErrorSummary,
      per_source_stats: perSourceStats,
    });
  }

  // Re-throw AFTER finishScanRun so GitHub Actions exits non-zero and triggers send-crash-alert.mjs
  if (emailError) {
    throw emailError;
  }

  logger.info('Autonomous daily scan completed', {
    source: 'worker',
    emailTypeSent,
    leadsAdded,
    duplicatesMerged,
    recordsRejected,
    staleFlagged,
    failedSourceCount: failedSources.length,
    enrichmentAttempted,
    enrichmentFailed,
  });
}

main().catch((err) => {
  console.error('Unhandled worker error:', err);
  process.exit(1);
});
