import { logger } from '../logger';
import {
  AdapterBlockedError,
  AdapterHttpError,
  RobotsDisallowedError,
} from './errors';

export const USER_AGENT =
  'DistressDealFinder/1.0 (+https://github.com/distress-deal-finder; polite-public-records-bot)';

interface RobotsRules {
  disallowedPaths: string[];
  crawlDelayMs: number;
}

const robotsCache = new Map<string, RobotsRules>();
const lastRequestByHost = new Map<string, number>();

const BOT_BLOCK_PATTERNS = [
  /cf-browser-verification/i,
  /just a moment\.\.\./i,
  /attention required!\s*\|\s*cloudflare/i,
  /g-recaptcha/i,
  /h-captcha/i,
  /px-captcha/i,
  /access denied.*reference\s*#/i,
  /verify you are human/i,
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBaseDelayMs(): number {
  const parsed = Number(process.env.SCRAPER_DELAY_MS ?? 1500);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1500;
}

function getTimeoutMs(): number {
  const parsed = Number(process.env.SCRAPER_TIMEOUT_MS ?? 20000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20000;
}

function parseRobotsTxt(content: string): RobotsRules {
  const disallowedPaths: string[] = [];
  let crawlDelayMs = 0;
  let inRelevantSection = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const [rawKey, ...rest] = line.split(':');
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      const ua = value.toLowerCase();
      inRelevantSection = ua === '*' || ua.includes('distressdealfinder');
    } else if (inRelevantSection && key === 'disallow' && value) {
      disallowedPaths.push(value);
    } else if (inRelevantSection && key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) {
        crawlDelayMs = Math.max(crawlDelayMs, seconds * 1000);
      }
    }
  }

  return { disallowedPaths, crawlDelayMs };
}

async function getRobotsRules(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const text = await res.text();
      const rules = parseRobotsTxt(text);
      robotsCache.set(origin, rules);
      return rules;
    }
  } catch {
    // If robots.txt is unreachable or 404, proceed with default polite delay.
  }

  const fallback: RobotsRules = { disallowedPaths: [], crawlDelayMs: 0 };
  robotsCache.set(origin, fallback);
  return fallback;
}

function isPathDisallowed(pathname: string, rules: RobotsRules): boolean {
  for (const disallowed of rules.disallowedPaths) {
    if (disallowed === '/') return true;
    if (pathname.startsWith(disallowed)) return true;
  }
  return false;
}

export interface PoliteFetchOptions {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  maxRetries?: number;
  source?: string;
  county?: string;
  state?: string;
}

export async function politeFetchText(
  url: string,
  options: PoliteFetchOptions = {}
): Promise<{ text: string; finalUrl: string; status: number }> {
  const parsedUrl = new URL(url);
  const rules = await getRobotsRules(parsedUrl.origin);

  if (isPathDisallowed(parsedUrl.pathname, rules)) {
    throw new RobotsDisallowedError(url);
  }

  const requiredDelay = Math.max(getBaseDelayMs(), rules.crawlDelayMs);
  const maxRetries = options.maxRetries ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Polite per-host rate limiting with small jitter
    const prevTs = lastRequestByHost.get(parsedUrl.host) ?? 0;
    const elapsed = Date.now() - prevTs;
    const jitter = Math.floor(Math.random() * 350);
    const waitMs = Math.max(0, requiredDelay + jitter - elapsed);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastRequestByHost.set(parsedUrl.host, Date.now());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const res = await fetch(url, {
        method: options.method ?? 'GET',
        body: options.body,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(options.headers ?? {}),
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await res.text();

      if (res.status === 403 || res.status === 429) {
        throw new AdapterBlockedError(url, `HTTP ${res.status} (${res.statusText})`, res.status);
      }

      if (res.status >= 500) {
        throw new AdapterHttpError(url, res.status, res.statusText);
      }

      if (!res.ok) {
        throw new AdapterHttpError(url, res.status, res.statusText);
      }

      for (const pattern of BOT_BLOCK_PATTERNS) {
        if (pattern.test(text)) {
          throw new AdapterBlockedError(
            url,
            `Response body matched bot-protection/CAPTCHA pattern (${pattern.source})`,
            res.status
          );
        }
      }

      return { text, finalUrl: res.url || url, status: res.status };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      // Never retry hard blocks or robots.txt disallow
      if (err instanceof AdapterBlockedError || err instanceof RobotsDisallowedError) {
        throw err;
      }

      if (attempt < maxRetries) {
        const backoffMs = 1500 * Math.pow(2, attempt - 1);
        logger.warn(`Retrying request (attempt ${attempt + 1}/${maxRetries}) after ${backoffMs}ms`, {
          source: options.source,
          county: options.county,
          state: options.state,
          url,
        });
        await sleep(backoffMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
