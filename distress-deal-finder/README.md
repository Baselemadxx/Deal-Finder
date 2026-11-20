# Distress Deal Finder

An autonomous, 100% free-tier real estate wholesaling lead-generation system built for **Metro Atlanta, Georgia** (Fulton, DeKalb, Gwinnett, Cobb, Clayton), with **Ohio** and **Florida** adapters ready to switch on via a single config file.

**Core design rule: Silent failure is impossible.** Every daily scheduled scan ends in **either** a Daily Briefing email **or** an Error Report email naming the failed source, error, and last successful run — backed by a secondary GitHub Actions crash-alert fallback.

---

## Free-Tier Stack & Limits

| Layer | Service | Free Tier Limit |
| --- | --- | --- |
| Frontend & API | **Vercel (Hobby)** | Free for personal/non-commercial projects, automatic HTTPS & mobile-fast CDN |
| Database | **Supabase Free Tier (Postgres)** | 500 MB storage, 2 free projects (plenty for tens of thousands of leads) |
| Daily Scheduler | **GitHub Actions** | 2,000 free Linux minutes/month (daily scan uses ~2 min/day = ~60 min/month) |
| Email Alerts | **Gmail SMTP (App Password)** *(or Resend)* | Gmail: **500 emails/day free** (no domain required). Resend: 100/day, 3,000/month free. |
| AI Chat Panel | **Google Gemini API Free Tier** | Generous free tier via Google AI Studio; swap model in one line via `LLM_MODEL` |

---

## 1. Run Locally (5 Minutes — No Accounts Required)

The app ships with a **Demo / Seed Mode** (`DEMO_MODE=true`) backed by a local JSON file (`.data/local-db.json`) pre-loaded with realistic Metro Atlanta leads so you can inspect the entire UI before connecting Supabase.

1. **Install Node.js 22+** from [nodejs.org](https://nodejs.org/).
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Create your local env file:**
   ```bash
   cp .env.example .env.local
   ```
   Keep `DEMO_MODE=true` and `EMAIL_PROVIDER=console` for local testing.
4. **Seed the demo database (optional — auto-seeds on first load):**
   ```bash
   npm run seed
   ```
5. **Start the website:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) (or open it on your phone over your Wi-Fi IP).
6. **Run the unit test suite:**
   ```bash
   npm test
   ```
7. **Test a dry-run scan (prints email preview to terminal without writing to DB):**
   ```bash
   npm run scan:dry
   ```

---

## 2. Connect Supabase (Free Postgres Database)

1. Go to [supabase.com](https://supabase.com) and create a free account + new project.
2. In your Supabase dashboard, open **SQL Editor** -> **New query**.
3. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`, paste it into the SQL Editor, and click **Run**.
4. Go to **Project Settings** -> **API** and copy:
   - **Project URL** -> `SUPABASE_URL`
   - **`service_role` secret key** -> `SUPABASE_SERVICE_ROLE_KEY` (keep this secret; it is only ever used on the server and in GitHub Actions, never in the browser).
5. *(Optional)* Seed demo data into Supabase so the dashboard isn't empty before your first scan:
   ```bash
   DEMO_MODE=false SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
   ```

---

## 3. Set Up Free Email Alerts (Gmail SMTP — Recommended)

Gmail SMTP lets you send up to **500 emails/day for free** without buying a domain or credit card.

1. Turn on **2-Step Verification** on your Google account if not already enabled.
2. Visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Create an App Password named `Distress Deal Finder` and copy the 16-character password.
4. Set these environment variables:
   ```env
   EMAIL_PROVIDER=gmail
   GMAIL_USER=yourname@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ALERT_EMAIL_TO=yourname@gmail.com
   ALERT_EMAIL_FROM=Distress Deal Finder <yourname@gmail.com>
   ```
*(Alternative: If you prefer Resend, set `EMAIL_PROVIDER=resend` and `RESEND_API_KEY=...` — free up to 100 emails/day, 3,000/month.)*

---

## 4. Enable the Free AI Chat Panel

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and click **Create API Key** (free, no credit card).
2. Set in `.env.local` and Vercel:
   ```env
   LLM_MODEL=gemini-2.5-flash
   LLM_API_KEY=your_gemini_api_key
   ```
3. **Swapping models later:** Change **only** the single `LLM_MODEL` environment variable (e.g., `gemini-2.5-flash-lite` or a newer Flash release) and redeploy.

---

## 5. Deploy to Vercel (Free Tier)

1. Push this repository to a **GitHub** repo (private or public).
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, and click **Add New -> Project**.
3. Import your `distress-deal-finder` repository.
4. Under **Environment Variables**, add:
   - `DEMO_MODE` = `false`
   - `NEXT_PUBLIC_APP_URL` = `https://your-project-name.vercel.app`
   - `SUPABASE_URL` = *(from Step 2)*
   - `SUPABASE_SERVICE_ROLE_KEY` = *(from Step 2)*
   - `LLM_MODEL` = `gemini-2.5-flash`
   - `LLM_API_KEY` = *(from Step 4)*
5. Click **Deploy**. Bookmark the URL on your phone's home screen!

---

## 6. Enable the Autonomous Daily GitHub Action

1. In your GitHub repository, go to **Settings -> Secrets and variables -> Actions -> New repository secret**.
2. Add these repository secrets:
   - `NEXT_PUBLIC_APP_URL` (your Vercel URL, e.g. `https://distress-deal-finder.vercel.app`)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `EMAIL_PROVIDER` (`gmail` or `resend`)
   - `ALERT_EMAIL_TO`
   - `ALERT_EMAIL_FROM`
   - `GMAIL_USER` & `GMAIL_APP_PASSWORD` (if using `gmail`) or `RESEND_API_KEY` (if using `resend`)
   - `HIGH_SCORE_ALERT_THRESHOLD` (e.g. `70`)
   - `SCRAPER_DELAY_MS` (e.g. `1500`)
3. Go to the **Actions** tab -> **Daily Distress Deal Scan** -> click **Run workflow** to test immediately.
4. From now on, it runs automatically every morning at **11:00 UTC (6:00 AM EST / 7:00 AM EDT)** and emails you every single day.

---

## 7. How to Add or Activate a New County (Worked Example)

All markets live in one file: **`config/counties.json`**.

### Example A: Turn on Franklin County, Ohio (Already Configured)
Open `config/counties.json`, find `"id": "oh-franklin"`, and change `"enabled": false` to `"enabled": true`:
```json
{
  "id": "oh-franklin",
  "state": "OH",
  "county": "Franklin",
  "enabled": true,
  "adapters": ["oh-sheriff-sale", "oh-auditor-delinquent-tax"],
  "sourceConfig": {
    "sheriffSaleSubdomain": "franklin.sheriffsaleauction.ohio.gov",
    "delinquentTaxUrl": "https://treasurer.franklincountyohio.gov/delinquent-taxes"
  }
}
```

### Example B: Add a Brand-New Florida County (e.g. Pinellas County, FL)
Add one entry inside the `"counties"` array in `config/counties.json`:
```json
{
  "id": "fl-pinellas",
  "state": "FL",
  "county": "Pinellas",
  "enabled": true,
  "adapters": ["fl-realforeclose", "fl-clerk-lis-pendens", "fl-lienhub-tax"],
  "sourceConfig": {
    "realForecloseSubdomain": "pinellas.realforeclose.com",
    "clerkOfficialRecordsUrl": "https://officialrecords.mypinellasclerk.org/",
    "lienHubCountySlug": "pinellas",
    "taxDeedSubdomain": "pinellas.realtaxdeed.com"
  }
}
```
Commit and push to GitHub. The next morning's scan automatically picks up the new county and adds its sources to the Dashboard Source Health panel.

---

## 8. Manual Skip Trace Workflow (Free, Honest, Accurate)

Because there is no free automated phone-number API, use this 3-minute manual workflow on your Top 10 leads:

1. Open the lead detail page and check **Owner of Record** and **Mailing Address** (from qPublic enrichment).
2. **If the owner is an individual:**
   - Search their name + city/state on [TruePeopleSearch.com](https://www.truepeoplesearch.com/) or [FastPeopleSearch.com](https://www.fastpeoplesearch.com/) (free).
   - If the owner is an **Estate**, check the county Probate Court online docket for the executor/administrator name.
3. **If the owner is an LLC or Corporation (Georgia):**
   - Look up the entity on the [GA Secretary of State eCorp portal](https://ecorp.sos.ga.gov/BusinessSearch) (free) to find the **Registered Agent** name and address, then look up that person.
4. Enter the verified numbers/notes in the lead's **Manual Skip Trace** section and mark status `Completed`.

---

## 9. Troubleshooting Common Failures

- **You received an `[ACTION REQUIRED] Error Report` email:**
  - Read the **Failed Sources** box — it tells you the exact source, county, error, and last successful run.
  - **`ADAPTER_BLOCKED` (HTTP 403/429 or CAPTCHA):** The county site added bot protection or rate-limited GitHub Actions' IP. Try increasing `SCRAPER_DELAY_MS` to `3000` in GitHub Secrets, or temporarily disable that single adapter in `config/counties.json` while you review.
  - **`ADAPTER_SHAPE_CHANGED`:** The website redesigned its HTML layout. Update the CSS selector in `src/lib/scraper/adapters/<adapter>.ts`.
- **You received a `[CRITICAL] Scan Crashed` email:**
  - Click the GitHub Actions run link in the email. Most often a secret (`SUPABASE_URL`, `GMAIL_APP_PASSWORD`) is missing or expired.
- **Gmail SMTP rejects login (`535 Username and Password not accepted`):**
  - You must use a 16-character **Google App Password**, not your normal Gmail password.
- **Supabase Free Tier paused after 7 days of inactivity:**
  - Because the GitHub Action writes to Supabase every morning, your project stays active automatically and will not pause!
