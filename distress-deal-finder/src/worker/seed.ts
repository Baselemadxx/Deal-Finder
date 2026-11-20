import { isDemoMode } from '../lib/config';
import { LocalFileStore } from '../lib/db/local-store';
import { buildSeedDataset } from '../lib/db/seed-data';
import { createClient } from '@supabase/supabase-js';

async function main() {
  if (isDemoMode()) {
    const store = new LocalFileStore();
    store.resetWithSeed();
    console.log('Seeded local demo database at .data/local-db.json with realistic Metro Atlanta leads.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set when DEMO_MODE=false');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const seed = buildSeedDataset();

  const { error: leadErr } = await supabase.from('leads').upsert(seed.leads, { onConflict: 'dedupe_key' });
  if (leadErr) throw new Error(`Seed leads failed: ${leadErr.message}`);

  const { error: healthErr } = await supabase
    .from('source_health')
    .upsert(seed.sourceHealth, { onConflict: 'source_key' });
  if (healthErr) throw new Error(`Seed source_health failed: ${healthErr.message}`);

  const { error: runErr } = await supabase.from('scan_runs').insert(seed.scanRuns);
  if (runErr) throw new Error(`Seed scan_runs failed: ${runErr.message}`);

  console.log(`Seeded Supabase with ${seed.leads.length} demo Metro Atlanta leads and source health records.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
