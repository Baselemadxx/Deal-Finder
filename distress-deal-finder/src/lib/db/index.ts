import { isDemoMode } from '../config';
import { DatabaseClient } from './interface';
import { LocalFileStore } from './local-store';
import { SupabaseStore } from './supabase-store';

let cachedDb: DatabaseClient | null = null;

export function getDb(): DatabaseClient {
  if (cachedDb) return cachedDb;
  cachedDb = isDemoMode() ? new LocalFileStore() : new SupabaseStore();
  return cachedDb;
}

export * from './interface';
