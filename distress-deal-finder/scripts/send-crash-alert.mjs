#!/usr/bin/env node
/**
 * Emergency Crash Alert Script
 *
 * Runs ONLY when the GitHub Actions workflow fails before the main scan runner
 * could send its own Daily Briefing or Error Report email.
 * Uses Resend HTTP API (zero dependencies) or Nodemailer Gmail SMTP.
 */

const provider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
const to = process.env.ALERT_EMAIL_TO;
const from = process.env.ALERT_EMAIL_FROM || process.env.GMAIL_USER || 'alerts@distress-deal-finder.local';
const runUrl = process.env.GITHUB_RUN_URL || 'Unknown GitHub Actions URL';
const workflow = process.env.FAILED_WORKFLOW || 'Daily Distress Deal Scan';
const timestamp = new Date().toISOString();

const subject = `[CRITICAL] Distress Deal Finder Scan Crashed — ${timestamp.slice(0, 10)}`;
const text = [
  'DISTRESS DEAL FINDER — EMERGENCY CRASH ALERT',
  '=============================================',
  '',
  `Workflow:  ${workflow}`,
  `Timestamp: ${timestamp}`,
  `Run URL:   ${runUrl}`,
  '',
  'The scheduled daily scan crashed before it could complete normally.',
  'Open the GitHub Actions run link above to inspect the full stack trace.',
  '',
  'Common causes:',
  '- Missing or expired GitHub Action secret (SUPABASE_URL, GMAIL_APP_PASSWORD, etc.)',
  '- Dependency installation failure (npm ci)',
  '- Unhandled runtime exception in a scraper adapter',
].join('\n');

async function main() {
  if (!to) {
    console.error('[CRASH-ALERT] ALERT_EMAIL_TO is not set! Cannot send crash email.');
    console.error(text);
    process.exit(1);
  }

  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is missing in crash-alert fallback.');
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }
    console.log('[CRASH-ALERT] Emergency crash email sent via Resend.');
    return;
  }

  if (provider === 'gmail') {
    const nodemailer = await import('nodemailer');
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD missing in crash-alert fallback.');
    }
    const transporter = nodemailer.default.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    await transporter.sendMail({ from, to, subject, text });
    console.log('[CRASH-ALERT] Emergency crash email sent via Gmail SMTP.');
    return;
  }

  console.log('[CRASH-ALERT] Console mode email output:');
  console.log({ to, from, subject, text });
}

main().catch((err) => {
  console.error('[CRASH-ALERT] Failed to send emergency crash email:', err);
  process.exit(1);
});
