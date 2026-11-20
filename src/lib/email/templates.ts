import { getAppUrl } from '../config';
import {
  DashboardSummary,
  DISTRESS_TYPE_LABELS,
  Lead,
  PerSourceRunStat,
  SourceHealth,
} from '../types';
import { EmailMessage } from './mailer';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildHighScoreLeadAlertEmail(lead: Lead): EmailMessage {
  const appUrl = getAppUrl();
  const leadUrl = `${appUrl}/leads/${lead.id}`;
  const signals = lead.distress_types.map((d) => DISTRESS_TYPE_LABELS[d] ?? d).join(', ');
  const subject = `[HOT LEAD ${lead.motivation_score}/100] ${lead.address} (${lead.county}, ${lead.state})`;

  const breakdownRows = lead.score_breakdown
    .map((b) => `<li><strong>+${b.points}</strong> ${esc(b.label)} — ${esc(b.reason)}</li>`)
    .join('');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">
    <div style="background:#b91c1c;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;opacity:0.9;">Immediate High-Score Lead Alert</div>
      <h1 style="margin:6px 0 0;font-size:20px;">${esc(lead.address)}</h1>
      <div style="margin-top:4px;font-size:14px;">${esc(lead.county)} County, ${esc(lead.state)} &bull; Score: <strong>${lead.motivation_score}/100</strong></div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
      <p style="margin-top:0;"><strong>Distress Signals:</strong> ${esc(signals)}</p>
      ${lead.owner_name ? `<p><strong>Owner:</strong> ${esc(lead.owner_name)}</p>` : ''}
      ${lead.auction_date ? `<p><strong>Auction Date:</strong> ${esc(lead.auction_date)}</p>` : ''}
      ${lead.tax_delinquent_amount ? `<p><strong>Delinquent Taxes:</strong> $${lead.tax_delinquent_amount.toLocaleString()}</p>` : ''}
      <h3 style="margin-bottom:6px;font-size:14px;">Motivation Score Breakdown</h3>
      <ul style="margin-top:0;padding-left:18px;font-size:13px;">${breakdownRows}</ul>
      <div style="margin-top:20px;">
        <a href="${esc(leadUrl)}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:8px;">Open in Deal Finder</a>
        <a href="${esc(lead.source_url)}" style="display:inline-block;background:#f1f5f9;color:#0f172a;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">View Public Source</a>
      </div>
    </div>
  </div>`;

  const text = [
    `HOT LEAD ALERT — Score ${lead.motivation_score}/100`,
    `Property: ${lead.address}, ${lead.county} County, ${lead.state}`,
    `Signals:  ${signals}`,
    lead.owner_name ? `Owner:    ${lead.owner_name}` : null,
    lead.auction_date ? `Auction:  ${lead.auction_date}` : null,
    '',
    'Score Breakdown:',
    ...lead.score_breakdown.map((b) => `  +${b.points} ${b.label}: ${b.reason}`),
    '',
    `App Link:    ${leadUrl}`,
    `Source Link: ${lead.source_url}`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return { subject, html, text };
}

export interface FailedSourceForEmail {
  sourceName: string;
  county: string;
  state: string;
  errorMessage: string;
  stack?: string;
  lastSuccessAt: string | null;
}

export interface RunMetricsForEmail {
  dateLabel: string;
  leadsAdded: number;
  duplicatesMerged: number;
  recordsRejected: number;
  staleFlagged: number;
  highScoreAlertsSent: number;
  perSourceStats: PerSourceRunStat[];
  failedSources: FailedSourceForEmail[];
  fatalError?: string;
  enrichmentStats: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
}

export function buildDailyBriefingEmail(
  summary: DashboardSummary,
  metrics: RunMetricsForEmail
): EmailMessage {
  const appUrl = getAppUrl();
  const failureCount = metrics.failedSources.length;
  const silentZeroSources = summary.sourceHealth.filter(
    (s) => s.status === 'healthy' && s.has_ever_produced_records && s.consecutive_zero_runs >= 3
  );
  const enrichmentFullyFailing =
    metrics.enrichmentStats.attempted > 0 &&
    metrics.enrichmentStats.failed === metrics.enrichmentStats.attempted;

  const statusTag =
    failureCount > 0 || metrics.fatalError
      ? ` (${failureCount || 1} Source Issue${failureCount === 1 ? '' : 's'})`
      : silentZeroSources.length > 0
        ? ` (${silentZeroSources.length} Silent-Zero Warning${silentZeroSources.length === 1 ? '' : 's'})`
        : '';

  const subject = `[Daily Briefing] ${metrics.leadsAdded} New Leads | ${summary.totalActive} Active${statusTag} — ${metrics.dateLabel}`;

  const top10Html = summary.top10
    .map(
      (lead, idx) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">#${idx + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">
          <a href="${esc(`${appUrl}/leads/${lead.id}`)}" style="color:#0f172a;font-weight:600;text-decoration:none;">${esc(lead.address)}</a><br/>
          <span style="font-size:12px;color:#475569;">${esc(lead.county)}, ${esc(lead.state)} &bull; ${esc(
            lead.distress_types.map((d) => DISTRESS_TYPE_LABELS[d] ?? d).join(', ')
          )}</span>
        </td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#b91c1c;">${lead.motivation_score}</td>
      </tr>`
    )
    .join('');

  const distressHtml = Object.entries(summary.byDistressType)
    .map(([k, v]) => `<li>${esc(DISTRESS_TYPE_LABELS[k as keyof typeof DISTRESS_TYPE_LABELS] ?? k)}: <strong>${v}</strong></li>`)
    .join('');

  const countyHtml = summary.byCounty
    .map((c) => `<li>${esc(c.county)}, ${esc(c.state)}: <strong>${c.count}</strong></li>`)
    .join('');

  const sourceFailuresHtml =
    failureCount > 0 || metrics.fatalError
      ? `
      <div style="border:1px solid #fecaca;background:#fef2f2;padding:14px;border-radius:8px;margin-bottom:20px;">
        <h2 style="font-size:15px;margin:0 0 8px;color:#991b1b;">Source Failures (${failureCount})</h2>
        ${metrics.fatalError ? `<p style="color:#991b1b;font-weight:700;font-size:13px;">Fatal Runner Error: ${esc(metrics.fatalError)}</p>` : ''}
        ${metrics.failedSources
          .map(
            (f) => `
          <div style="border-top:1px solid #fecaca;padding-top:8px;margin-top:8px;font-size:13px;">
            <strong style="color:#991b1b;">${esc(f.sourceName)} (${esc(f.county)}, ${esc(f.state)})</strong><br/>
            <span>Reason: ${esc(f.errorMessage)}</span><br/>
            <span style="font-size:12px;color:#7f1d1d;">Last Successful Run: ${esc(f.lastSuccessAt ?? 'Never')}</span>
          </div>`
          )
          .join('')}
      </div>`
      : '';

  const silentZeroHtml =
    silentZeroSources.length > 0
      ? `
      <div style="border:1px solid #fde68a;background:#fffbeb;padding:14px;border-radius:8px;margin-bottom:20px;">
        <h2 style="font-size:15px;margin:0 0 8px;color:#92400e;">Silent-Zero Warnings (${silentZeroSources.length})</h2>
        <p style="font-size:12px;color:#78350f;margin:0 0 8px;">These sources previously produced records but returned 0 records for 3+ consecutive runs:</p>
        <ul style="font-size:13px;margin:0;padding-left:18px;color:#78350f;">
          ${silentZeroSources
            .map(
              (s) =>
                `<li><strong>${esc(s.source_name)} (${esc(s.county)}, ${esc(s.state)})</strong> &mdash; ${s.consecutive_zero_runs} consecutive zero-record runs</li>`
            )
            .join('')}
        </ul>
      </div>`
      : '';

  const enrichmentBannerHtml = enrichmentFullyFailing
    ? `
      <div style="border:1px solid #fed7aa;background:#fff7ed;padding:12px 14px;border-radius:8px;margin-bottom:20px;font-size:13px;color:#9a3412;">
        <strong>Enrichment fully failing this run:</strong> ${metrics.enrichmentStats.failed}/${metrics.enrichmentStats.attempted} county assessor (qPublic) lookups failed. (Expected on datacenter IPs like GitHub Actions because qPublic returns HTTP 403.)
      </div>`
    : '';

  const sourceHealthHtml = summary.sourceHealth
    .map(
      (s) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${esc(s.source_name)} (${esc(s.county)}, ${esc(s.state)})</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:${s.status === 'healthy' ? '#15803d' : '#b91c1c'};font-weight:600;">${s.status.toUpperCase()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${s.last_record_count}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">${esc(s.last_success_at ?? 'Never')}</td>
      </tr>`
    )
    .join('');

  const headerSubtitle =
    failureCount > 0 || metrics.fatalError
      ? `${esc(metrics.dateLabel)} &bull; ${failureCount} source failure${failureCount === 1 ? '' : 's'} reported below`
      : `${esc(metrics.dateLabel)} &bull; All active sources healthy`;

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;color:#0f172a;">
    <div style="background:#0f172a;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:20px;">Distress Deal Finder — Daily Briefing</h1>
      <div style="margin-top:4px;font-size:13px;opacity:0.85;">${headerSubtitle}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
      ${sourceFailuresHtml}
      ${silentZeroHtml}
      ${enrichmentBannerHtml}

      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <tr>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#0f172a;">${metrics.leadsAdded}</div>
            <div style="font-size:12px;color:#475569;">New Leads Today</div>
          </td>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#0f172a;">${summary.totalActive}</div>
            <div style="font-size:12px;color:#475569;">Total Active Leads</div>
          </td>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#b91c1c;">${metrics.highScoreAlertsSent}</div>
            <div style="font-size:12px;color:#475569;">Immediate Hot Alerts</div>
          </td>
        </tr>
      </table>

      <h2 style="font-size:16px;margin-bottom:8px;">Top 10 Active Leads by Motivation Score</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        ${top10Html || '<tr><td>No active leads yet.</td></tr>'}
      </table>

      <h2 style="font-size:16px;margin-bottom:6px;">Counts by Distress Type &amp; County</h2>
      <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:13px;margin-bottom:20px;">
        <div><strong>By Distress Type</strong><ul>${distressHtml}</ul></div>
        <div><strong>By County</strong><ul>${countyHtml}</ul></div>
      </div>

      <h2 style="font-size:16px;margin-bottom:6px;">Data Health (Today's Scan)</h2>
      <ul style="font-size:13px;margin-top:0;">
        <li>Leads added: <strong>${metrics.leadsAdded}</strong></li>
        <li>Duplicates merged: <strong>${metrics.duplicatesMerged}</strong></li>
        <li>Incomplete records rejected: <strong>${metrics.recordsRejected}</strong></li>
        <li>Auto-flagged Stale 120+: <strong>${metrics.staleFlagged}</strong></li>
        <li>Assessor enrichment: <strong>${metrics.enrichmentStats.succeeded}/${metrics.enrichmentStats.attempted} succeeded</strong></li>
      </ul>

      <h2 style="font-size:16px;margin-bottom:8px;">Source Health</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:6px 8px;">Source</th>
            <th style="padding:6px 8px;">Status</th>
            <th style="padding:6px 8px;text-align:right;">Records</th>
            <th style="padding:6px 8px;">Last Success</th>
          </tr>
        </thead>
        <tbody>${sourceHealthHtml}</tbody>
      </table>

      <div style="margin-top:20px;">
        <a href="${esc(appUrl)}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Open Dashboard</a>
      </div>
    </div>
  </div>`;

  const text = [
    `DISTRESS DEAL FINDER — DAILY BRIEFING (${metrics.dateLabel})`,
    '==========================================================',
    `New Leads Today: ${metrics.leadsAdded}`,
    `Total Active:    ${summary.totalActive}`,
    `Hot Alerts Sent: ${metrics.highScoreAlertsSent}`,
    '',
    ...(failureCount > 0 || metrics.fatalError
      ? [
          'SOURCE FAILURES:',
          ...(metrics.fatalError ? [`  FATAL: ${metrics.fatalError}`] : []),
          ...metrics.failedSources.map(
            (f) =>
              `  - ${f.sourceName} (${f.county}, ${f.state}): ${f.errorMessage} (Last OK: ${f.lastSuccessAt ?? 'Never'})`
          ),
          '',
        ]
      : []),
    ...(silentZeroSources.length > 0
      ? [
          'SILENT-ZERO WARNINGS (3+ consecutive zero-record runs):',
          ...silentZeroSources.map(
            (s) =>
              `  - ${s.source_name} (${s.county}, ${s.state}): ${s.consecutive_zero_runs} consecutive zero runs`
          ),
          '',
        ]
      : []),
    ...(enrichmentFullyFailing
      ? [
          `ENRICHMENT WARNING: Enrichment fully failing this run (${metrics.enrichmentStats.failed}/${metrics.enrichmentStats.attempted} failed — expected from datacenter IPs due to qPublic HTTP 403).`,
          '',
        ]
      : []),
    'TOP 10 BY MOTIVATION SCORE:',
    ...summary.top10.map(
      (l, i) => `  ${i + 1}. [${l.motivation_score}] ${l.address} (${l.county}, ${l.state}) — ${appUrl}/leads/${l.id}`
    ),
    '',
    'DATA HEALTH:',
    `  Added: ${metrics.leadsAdded} | Duplicates Merged: ${metrics.duplicatesMerged} | Rejected: ${metrics.recordsRejected} | Stale 120+ Flagged: ${metrics.staleFlagged} | Enrichment: ${metrics.enrichmentStats.succeeded}/${metrics.enrichmentStats.attempted}`,
    '',
    'SOURCE HEALTH:',
    ...summary.sourceHealth.map(
      (s) => `  [${s.status.toUpperCase()}] ${s.source_name} (${s.county}, ${s.state}) — ${s.last_record_count} records, last success: ${s.last_success_at ?? 'Never'}`
    ),
    '',
    `Dashboard: ${appUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export function buildErrorReportEmail(input: {
  dateLabel: string;
  failedSources: Array<{
    sourceName: string;
    county: string;
    state: string;
    errorMessage: string;
    stack?: string;
    lastSuccessAt: string | null;
  }>;
  fatalError?: string;
  metrics: RunMetricsForEmail;
  allSourceHealth: SourceHealth[];
}): EmailMessage {
  const appUrl = getAppUrl();
  const count = input.failedSources.length;
  const subject = `[ACTION REQUIRED] Distress Deal Finder Error Report (${count || 1} failure${count === 1 ? '' : 's'}) — ${input.dateLabel}`;

  const failuresHtml = input.failedSources
    .map(
      (f) => `
      <div style="border:1px solid #fecaca;background:#fef2f2;padding:12px;border-radius:6px;margin-bottom:12px;">
        <div style="font-weight:700;color:#991b1b;">${esc(f.sourceName)} — ${esc(f.county)}, ${esc(f.state)}</div>
        <div style="font-size:13px;margin-top:4px;"><strong>Error:</strong> ${esc(f.errorMessage)}</div>
        <div style="font-size:12px;color:#7f1d1d;margin-top:4px;"><strong>Last Successful Run:</strong> ${esc(f.lastSuccessAt ?? 'Never')}</div>
        ${f.stack ? `<pre style="font-size:11px;overflow:auto;background:#fff;padding:8px;border:1px solid #fecaca;margin-top:6px;">${esc(f.stack.slice(0, 600))}</pre>` : ''}
      </div>`
    )
    .join('');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;color:#0f172a;">
    <div style="background:#991b1b;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:20px;">Distress Deal Finder — Error Report</h1>
      <div style="margin-top:4px;font-size:13px;opacity:0.9;">${esc(input.dateLabel)} &bull; Zero-Silent-Failure Alert</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
      ${input.fatalError ? `<p style="color:#991b1b;font-weight:700;">Fatal Runner Error: ${esc(input.fatalError)}</p>` : ''}
      <h2 style="font-size:16px;margin-top:0;">Failed Sources</h2>
      ${failuresHtml || '<p>No individual source error recorded — see fatal runner error above.</p>'}

      <h2 style="font-size:16px;">Partial Data Health Collected Before/Around Failure</h2>
      <ul style="font-size:13px;">
        <li>Leads added: <strong>${input.metrics.leadsAdded}</strong></li>
        <li>Duplicates merged: <strong>${input.metrics.duplicatesMerged}</strong></li>
        <li>Records rejected: <strong>${input.metrics.recordsRejected}</strong></li>
      </ul>

      <div style="margin-top:20px;">
        <a href="${esc(appUrl)}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Inspect Source Health on Dashboard</a>
      </div>
    </div>
  </div>`;

  const text = [
    `DISTRESS DEAL FINDER — ERROR REPORT (${input.dateLabel})`,
    '=======================================================',
    input.fatalError ? `FATAL ERROR: ${input.fatalError}` : null,
    '',
    'FAILED SOURCES:',
    ...input.failedSources.map(
      (f) =>
        `  - ${f.sourceName} (${f.county}, ${f.state})\n    Error: ${f.errorMessage}\n    Last Successful Run: ${f.lastSuccessAt ?? 'Never'}`
    ),
    '',
    `Partial Data Health: Added=${input.metrics.leadsAdded}, Merged=${input.metrics.duplicatesMerged}, Rejected=${input.metrics.recordsRejected}`,
    `Dashboard: ${appUrl}`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return { subject, html, text };
}
