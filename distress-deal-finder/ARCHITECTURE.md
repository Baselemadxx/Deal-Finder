# Distress Deal Finder — Architecture Note

## 1. End-to-End Data Flow (Zero-Silent-Failure Loop)

```
[GitHub Actions Cron (Daily 11:00 UTC)]
        │
        ├─ 1. Pre-flight config check (src/worker/check-config.ts)
        │     Fails fast if required secrets/config are missing.
        │
        ├─ 2. Autonomous Scan Runner (src/worker/run-scan.ts)
        │     ├─ Reads active counties from config/counties.json
        │     ├─ Runs each county's source adapters with polite HTTP client:
        │     │    • Descriptive User-Agent
        │     │    • robots.txt check & Crawl-delay respect
        │     │    • Per-host delay + jitter + exponential backoff
        │     │    • Bot-block / CAPTCHA / HTML-shape-change detection (fails loudly!)
        │     ├─ Runs cross-state Government Inventory adapters (HUD/HomePath/HomeSteps/USDA)
        │     ├─ Hard Verification Gate (src/lib/validation.ts):
        │     │    • Requires address, county, state, distressType, valid http(s) sourceUrl
        │     │    • Rejects incomplete rows -> logs to rejected_records
        │     │    • Deduplicates by parcel_id (if present) else normalized_address + county
        │     ├─ Upserts into Supabase Postgres (never overwrites first_seen_at or lead_history)
        │     ├─ Enriches newly added leads via county assessor (qPublic)
        │     ├─ Auto-flags any active lead tracked 120+ days as `stale_120_plus`
        │     ├─ Recalculates transparent Motivation Score (0–100) + breakdown
        │     ├─ Writes per-source heartbeat to `source_health` (green/red + last_success_at)
        │     ├─ Immediate email alert for any new lead >= HIGH_SCORE_ALERT_THRESHOLD
        │     └─ Run-level email guarantee:
        │          • All sources healthy -> Daily Briefing Email
        │          • Any source failed  -> Error Report Email (source, error, last_success_at)
        │
        └─ 3. Emergency Crash Fallback (scripts/send-crash-alert.mjs)
              Runs on `if: failure()` in GitHub Actions so even if npm ci, OOM, or
              a fatal crash kills the worker before emailing, you STILL get an email.

[Next.js Web App on Vercel Free Tier]
        │
        ├─ Reads the exact same Supabase Postgres database (always current)
        ├─ Mobile-first Dashboard, Top 10 Today, Filterable/Sortable Leads, Lead Detail
        └─ In-App AI Chat (/api/chat) -> Google Gemini Free Tier (single env var LLM_MODEL)
```

---

## 2. Public Data Sources per State

### Georgia (Active by default — Fulton, DeKalb, Gwinnett, Cobb, Clayton)
| Adapter ID | Source | Signal(s) | Notes |
| --- | --- | --- | --- |
| `ga-public-notice` | `georgiapublicnotice.com` | `pre_foreclosure`, `tax_sale` | Primary GA source. Non-judicial foreclosures are advertised ~4 weeks before first-Tuesday courthouse sales. |
| `ga-county-tax-sale` | County Tax Commissioner / Sheriff pages | `tax_sale` | County-published levy & tax sale schedules (configured per county in `config/counties.json`). |
| `ga-qpublic-enrichment` | `qpublic.net` / `qpublic.schneidercorp.com` | Enrichment | Adds parcel ID, owner name, mailing address, assessed value, absentee-owner detection. |

### Ohio (Adapters built — counties disabled in `config/counties.json` until switched on)
| Adapter ID | Source | Signal(s) | Notes |
| --- | --- | --- | --- |
| `oh-sheriff-sale` | `*.sheriffsaleauction.ohio.gov` | `foreclosure_auction` | Official Ohio sheriff sale auction platform (e.g. Franklin, Cuyahoga). |
| `oh-auditor-delinquent-tax` | County Auditor / Treasurer delinquent rolls | `tax_delinquent` | Published roughly twice per year. |

### Florida (Adapters built — counties disabled in `config/counties.json` until switched on)
| Adapter ID | Source | Signal(s) | Notes |
| --- | --- | --- | --- |
| `fl-realforeclose` | `*.realforeclose.com` | `foreclosure_auction` | Uniform foreclosure auction platform used across most FL counties. |
| `fl-clerk-lis-pendens` | County Clerk Official Records | `lis_pendens` | Pre-foreclosure judicial lawsuit filings. |
| `fl-lienhub-tax` | LienHub & `*.realtaxdeed.com` | `tax_deed` | Tax certificate & tax deed auction listings. |

### Cross-State Government Inventory (Active for all enabled states/counties)
- `hudhomestore.gov` (HUD Homes)
- `homepath.fanniemae.com` (Fannie Mae HomePath)
- `homesteps.com` (Freddie Mac HomeSteps)
- `resales.usda.gov` (USDA Rural Development Resales)

### Stale 120+ Signal (All States)
- Computed internally from `first_seen_at` stored in Postgres. Any active lead still unresolved 120 days after `first_seen_at` is automatically tagged `stale_120_plus` (+20 pts + stacking bonus) without scraping Zillow or Realtor.

---

## 3. Honest List: What Is NOT Possible for Free

1. **Automated Skip Tracing (Owner Phone Numbers & Personal Emails)**
   There is no legitimate free API that returns accurate owner cell/landline numbers. Any "free" scraper either violates terms/laws or returns garbage. Each lead has a dedicated **Manual Skip Trace** section and workflow documented in `README.md`.
2. **Real-Time MLS Days-on-Market / Zillow / Realtor.com Scraping**
   Zillow, Redfin, and Realtor aggressively block datacenter IPs (like GitHub Actions) with CAPTCHAs and WAFs. That is why this system generates its own `stale_120_plus` distress signal directly from `first_seen_at`.
3. **Automated Mortgage Balance / Equity / ARV Comps**
   Exact payoff balances and automated valuation models (AVMs) require paid title/MLS feeds (PropStream, BatchLeads, ATTOM). County assessor `assessed_value` from qPublic is free and included, but should be treated as a rough baseline — verify ARV manually before making an offer.
4. **Guaranteed Uninterrupted Parsing of Government Sites Behind CAPTCHAs**
   Some county portals occasionally add Cloudflare/CAPTCHA walls or publish tax lists only as scanned PDFs. When that happens, this system will **never** fail silently — it detects the block or HTML change and emails you an Error Report the same day.
