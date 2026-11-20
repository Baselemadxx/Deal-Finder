import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { CountyConfig, MasterConfig } from './types';

const CountySchema = z.object({
  id: z.string().min(1),
  state: z.string().length(2),
  county: z.string().min(1),
  enabled: z.boolean(),
  adapters: z.array(z.string()).min(1),
  sourceConfig: z.record(z.string().optional()),
});

const MasterConfigSchema = z.object({
  version: z.number(),
  description: z.string(),
  crossStateSources: z.object({
    govInventory: z.object({
      enabled: z.boolean(),
      sources: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          url: z.string().url(),
          enabled: z.boolean(),
        })
      ),
    }),
  }),
  counties: z.array(CountySchema),
});

let cachedConfig: MasterConfig | null = null;

export function loadMasterConfig(): MasterConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = path.join(process.cwd(), 'config', 'counties.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const validated = MasterConfigSchema.parse(parsed);
  cachedConfig = validated;
  return validated;
}

export function getActiveCounties(): CountyConfig[] {
  return loadMasterConfig().counties.filter((c) => c.enabled);
}

export function getAllCounties(): CountyConfig[] {
  return loadMasterConfig().counties;
}

export function getActiveStates(): string[] {
  return Array.from(new Set(getActiveCounties().map((c) => c.state)));
}

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === 'true') return true;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return true;
  }
  return false;
}

export function getHighScoreThreshold(): number {
  const parsed = Number(process.env.HIGH_SCORE_ALERT_THRESHOLD ?? 70);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 70;
}

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}
