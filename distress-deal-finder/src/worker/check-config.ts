import { getActiveCounties, isDemoMode } from '../lib/config';

function main() {
  const errors: string[] = [];

  if (!isDemoMode()) {
    if (!process.env.SUPABASE_URL) errors.push('Missing SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) errors.push('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  const provider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  if (process.env.DRY_RUN !== 'true' && provider !== 'console') {
    if (!process.env.ALERT_EMAIL_TO) errors.push('Missing ALERT_EMAIL_TO');
    if (provider === 'gmail') {
      if (!process.env.GMAIL_USER) errors.push('Missing GMAIL_USER for EMAIL_PROVIDER=gmail');
      if (!process.env.GMAIL_APP_PASSWORD) errors.push('Missing GMAIL_APP_PASSWORD for EMAIL_PROVIDER=gmail');
    } else if (provider === 'resend') {
      if (!process.env.RESEND_API_KEY) errors.push('Missing RESEND_API_KEY for EMAIL_PROVIDER=resend');
    } else {
      errors.push(`Invalid EMAIL_PROVIDER="${provider}". Expected gmail, resend, or console.`);
    }
  }

  const activeCounties = getActiveCounties();
  if (activeCounties.length === 0) {
    errors.push('No active counties enabled in config/counties.json');
  }

  if (errors.length > 0) {
    console.error('Configuration health-check FAILED:');
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(
    `Config OK: ${activeCounties.length} active counties (${activeCounties
      .map((c) => `${c.county}, ${c.state}`)
      .join('; ')}), email=${provider}, demoMode=${isDemoMode()}`
  );
}

main();
