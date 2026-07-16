# MARKETING GENIE — COMPLETE HANDOVER DOCUMENT

_Last updated: this session. Read this top to bottom before touching anything._

---

## 1. WHAT WE ARE BUILDING (the product in one page)

**Marketing Genie** is an autonomous **AI marketing operator** (SaaS) for solo founders and small businesses. The user pastes their website URL and Genie becomes their marketing employee. It is NOT a dashboard or an SEO checker — it is a **do-er** that runs a business's organic marketing end to end.

**The core loop:**
1. **Scan** the user's site → understand the product (what they sell, to whom).
2. **Keyword engine** → Genie (acting as an SEO expert) discovers real keywords, then *chooses the winning set* (high traffic + low competition = "easy wins"; high-potential long-tail for the long game). This is the "fuel tank."
3. **Market those keywords everywhere** → blogs/articles, Reddit, X, LinkedIn, Quora, forums, guest posts, and cold email.
4. **Own accounts first, then community** → each day Genie posts to the user's own accounts (build credibility), then finds live conversations to join, one channel at a time.
5. **Email outreach** → Genie finds potential clients, drafts personalized emails (with the user's profile baked in), and sends a daily batch (drip).
6. **Learn & follow up** → tracks engagement, answers every reply, doubles down on winners, retires losers.
7. **Show progress** → strength bar, keyword rankings climbing, honest traffic graph.

**Design language:** Ink (`#11202E`) + Paper (`#F8F8F6`), one muted emerald accent (`#1E9E6A`) only for live/winning/done states. Thin professional line icons (no emoji in UI). Real brand icons for platforms. The MG genie logo. Sweet, restrained animations. Genie has a warm, fun, teaching voice ("SEO is old but gold", "let's charm some future clients"). NO em-dashes in user-facing copy (they read as AI-generated).

**Honesty is a core product principle (enforced in code):**
- Non-owned platforms (Reddit/Quora/LinkedIn/Medium/forums) use **tap-to-post** — Genie writes it and opens the page, the user taps to publish. NO silent auto-posting into strangers' threads (that gets accounts banned). This is deliberate and non-negotiable.
- Owned channels that DO auto-execute for real: **WordPress** (publishes articles) and **email** (sends via Resend).
- X posting is **tap-to-post** (X's API posting is paid ~$200/mo; we use the free intent/compose URL).
- Keyword volumes/CPC/difficulty/ranking are **AI estimates, clearly labeled**, until Google Search Console is connected — then REAL data replaces them. We never fake real Google numbers.
- No fake engagement / SMM panels ever (bought likes get products blacklisted and poison the learning loop).

---

## 2. CURRENT STAGE (what's built vs. what's left)

### ✅ BUILT & WORKING (deployed or ready to deploy)
- **Core engine:** site scan/audit (46 checks + PageSpeed), AI router (Gemini → Groq → OpenRouter fallback), business understanding.
- **Keyword system:**
  - Portfolio (derive 20-30 keywords, health grading strong/growing/new/weak/retired, auto-retire losers).
  - **Keyword Research page** (`/research`) — the merged "Keywords" page. Auto-loads Genie's picked keywords in a pro table (volume, difficulty, CPC, trend sparkline, ranking, view action), tabs (All / High Potential / Easy Wins / Questions), stat cards, "Add Keyword" search. Genie picks best opportunities (traffic rewarded, competition punished). Discovery via **Google Autocomplete** (real, free); volumes/CPC = AI estimates until GSC.
  - **GSC sync** (`lib/keyword-sync.js`) — pulls real rankings/clicks, marks dead keywords, adds new winning queries, records daily history for climbing bars.
- **Placement/radar engine:** Reddit, Quora, Web (forums/listicles/guest) radars find live conversations, write value-first posts, stage as taps. Cadence caps + cooldowns per platform.
- **Daily ritual** (`/tasks`, "Today's taps") — channel-by-channel guided flow: own accounts first (X → LinkedIn → Reddit → blog), then community (Reddit/Quora/forums), then email. Progress spine, Genie narration, completion messages.
- **Owned-account execution:** WordPress auto-publish (real), email outreach auto-send (real, Resend). X/LinkedIn/Medium/Reddit/Quora = tap-to-post.
- **Email engine + directory** (`lib/email-engine.js`, `/api/outreach/campaign`) — one-tap daily batch, drip send, daily caps (Free 15/day, Pro 50/day), sources from shared `directory_contacts` by industry, logs to `outreach_log`, daily report. **NOTE: directory starts EMPTY — see "KNOWN GAPS."**
- **Reply/notification engine** (`/notifications`, "Inbox") — detects new replies on placements (Reddit strong, others best-effort), drafts answers, organized inbox with counts/filters.
- **Placement Story** (`/stories`, "Conversations") — living timeline of each conversation (found → wrote → posted → traction → replies → watching).
- **Overnight cron** (`/api/cron/genie`, 1am UTC) — re-runs GSC sync, keyword grading, all radars, engagement tracking, reply scan, outreach drip.
- **Guided setup wizard** (`/setup`) — after scan, first-time users connect accounts one-by-one (strength bar red→amber→green with %, teaching narration, skippable), then capture company/sender profile. Google/X auto-return to wizard after OAuth.
- **Company/sender profile** (`/api/profile`, editable in Settings) — name, sending email, company, website, phone, address, pitch. Baked into outreach emails.
- **Clean daily home** (`/dashboard`) — greeting (time-based), "Welcome to Marketing Genie", strength bar, 4 action buttons (Today's taps / Replies / Find openings / Conversations), honest traffic graph (real GSC data or honest "coming as you grow" placeholder).
- **Safety:** kill switch, permission levels, $0 spend cap (all in code). Daily brief email. Per-business chat with memory.
- **Design system:** ink/paper tokens, `components/ui/kit.js`, `Icon.js` (line icons), `BrandIcon.js` (real brand marks), `Logo.js` (uses `/public/logo.png`), `GenieVoice.js` (typewriter narration + strength bar).

### ❌ NOT BUILT / IN PROGRESS (the roadmap)
- **Directory seeding / contact discovery** — the email engine works but the directory is EMPTY. Need: Genie discovers 15-50 real, related business contacts daily from public sources (business directories, Google, etc.), emails them, keeps responders / drops non-responders. **Has legal weight (CAN-SPAM/GDPR): needs unsubscribe footer + physical address before sending real cold email.** NOT YET BUILT.
- **Email compliance** — unsubscribe link + physical address footer. Required before real cold outreach.
- **Real keyword volume data** — currently AI estimates + free Google Autocomplete discovery. Real volumes need Google Ads API (free-ish, weeks of approval, needs active campaign) or a paid source (DataForSEO/SerpApi ~$50-200/mo). GSC gives real data only for the user's OWN connected site.
- **Ads** — Meta + Google Ads login and campaign management. NOT built (Genie only drafts ad ideas). Needs weeks of platform approval.
- **Stripe / packages** — Free vs Pro is designed into the schema (`profiles.plan`) and caps, but no Stripe integration or paywall yet. Volume-gated model agreed (Free = fewer posts/keywords/emails; Pro = full swing). Blurred-keyword upsell planned.
- **Launch-gating:** Resend domain verification (currently uses `onboarding@resend.dev` — limited deliverability), Google OAuth verification (consent screen), API-token encryption (tokens stored plaintext + RLS), Vercel Hobby → Pro (for cron frequency).
- **Visual reskin remaining screens** — most screens are on the new ink/paper system; a few legacy views (some of `/business`, older dashboard sub-views) may still show old styling. Reskin as encountered.
- **Conversations page** styling still uses the older "aperture" light-premium kit (`kit.js`), not fully ink/paper yet.

---

## 3. TECH STACK

- **Framework:** Next.js 14.2.35 (App Router), React 18.3.1, React-DOM 18.3.1
- **Styling:** Tailwind CSS 3.4.x (config: `tailwind.config.js`), global CSS `app/globals.css`
- **Backend/DB/Auth:** Supabase (`@supabase/ssr@0.12.0`, `@supabase/supabase-js@2.110.0`)
- **Scraping/parsing:** cheerio@1.2.0
- **Animation:** framer-motion@11.11.9 (light use)
- **Hosting:** Vercel (auto-deploy from GitHub)
- **AI models:** Gemini `gemini-2.5-flash` (primary), Groq `openai/gpt-oss-120b` (fallback), OpenRouter `meta-llama/llama-3.3-70b-instruct:free` (fallback)
- **Email:** Resend (REST API)

**Node/build:** `npm run build` must show "✓ Compiled successfully". The font-minify CssSyntaxError warning is harmless (sandbox only).

---

## 4. DEVELOPMENT WORKFLOW (critical — how the owner works)

The owner (Ehtisham) works **entirely through the GitHub web UI. No local terminal, no local build.**
- Code is edited/pasted directly into GitHub files (github.com/ehtishampayoneer/thegenieofmarketing — confirm exact repo).
- Vercel auto-deploys on every commit.
- **When delivering code: always give COMPLETE, paste-ready files** (not diffs or "change line X"). Provide the exact file path.
- To create a new file/folder in GitHub web UI: **Add file → Create new file**, then type the full path with slashes (e.g. `app/api/foo/route.js`) — typing `/` creates folders. For images: **Add file → Upload files**.
- `[id]` in a path is a literal Next.js dynamic-route folder name (with brackets).
- Verify every change with a build before delivering. Flag any scope cuts loudly.
- Download links for delivered files expire when a new batch generates — re-share if "failed to load".

---

## 5. VERCEL — ENVIRONMENT VARIABLES

All set in Vercel project settings → Environment Variables. **Every var below is referenced in code:**

### Supabase (required)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, for admin/cron writes)

### AI (at least one required; router falls back in order)
- `GEMINI_API_KEY` (primary), optional `GEMINI_MODEL` (default `gemini-2.5-flash`)
- `GROQ_API_KEY` (fallback), optional `GROQ_MODEL`
- `OPENROUTER_API_KEY` (fallback), optional `OPENROUTER_MODEL`

### Google / Search Console OAuth (for GSC connect)
- `GOOGLE_CONNECT_CLIENT_ID`
- `GOOGLE_CONNECT_CLIENT_SECRET`
- `GOOGLE_CONNECT_REDIRECT_URI` (= `https://thegenieofmarketing.vercel.app/api/connect/google/callback`)
- `GOOGLE_API_KEY` (used by some Google calls), `PAGESPEED_API_KEY` (PageSpeed audit)

### X / Twitter OAuth (for X connect; posting is tap-to-post/free)
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_REDIRECT_URI` (= `https://thegenieofmarketing.vercel.app/api/connect/x/callback`)

### Email (Resend)
- `RESEND_API_KEY`
- `BRIEF_FROM` (optional sender, e.g. `Genie <you@yourdomain.com>`; defaults to `onboarding@resend.dev` — **limited deliverability until you verify your own domain in Resend**)

### App / cron
- `APP_URL` (= `https://thegenieofmarketing.vercel.app`) — used by cron to call its own endpoints
- `CRON_SECRET` — shared secret; cron endpoints check header `x-genie-cron` against this

**Connected accounts in use:**
- Google account connected for GSC: `thegenieofmarketing@gmail.com`
- Resend: sending via `onboarding@resend.dev` (default) until a custom domain is verified.
- Test site used during dev: `holos-new.vercel.app` (an AR product store — "Amazon but view products in AR in your room before buying").

---

## 6. VERCEL — CRON JOBS (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/brief", "schedule": "0 3 * * *" },
    { "path": "/api/cron/genie", "schedule": "0 1 * * *" }
  ]
}
```
- `/api/cron/genie` (1am UTC daily): per business → GSC keyword sync, re-grade keywords, run Reddit/Quora/Web radars, engagement tracking, reply scan + draft, outreach email drip. Guarded by `CRON_SECRET`.
- `/api/brief` (3am UTC daily): sends the daily brief email.
- **NOTE:** Vercel Hobby limits cron to once/day. Pro needed for more frequent runs.

---

## 7. SUPABASE — COMPLETE SCHEMA

All tables have Row Level Security (RLS) enabled with owner-only policies unless noted. Run any missing SQL in the Supabase SQL editor. **The owner runs SQL manually — always provide the full SQL block when a feature needs it.**

### `profiles` (user profile + settings)
Columns added over time:
```
id (uuid, = auth.users.id), onboarding_completed (bool), onboarding_completed_at,
sender_name, sender_email, company_name, company_website, company_phone,
company_address, company_pitch, setup_completed (bool), plan (text default 'free')  -- 'free' | 'pro'
```

### `scans` (site audit results)
```
id, user_id, url, final_url, overall_score, scores (jsonb), accuracy, checks (jsonb),
ai (jsonb — business understanding), speed (jsonb), gsc (jsonb), created_at
```

### `connections` (OAuth tokens)
```
id, user_id, provider ('google'|'wordpress'|'x'), access_token, refresh_token,
google_email, gsc_site, scopes, meta (jsonb — X stores handle/x_user_id/expires_at), created_at
```
_Tokens stored plaintext + RLS. Encryption is a launch-gating TODO._

### `actions` (the task/action spine)
```
id, user_id, type (article|social_post|distribution|outreach_email|community_engagement|...),
title, payload (jsonb), target (jsonb), status (proposed→approved→executing→done→failed→dismissed),
priority, scan_id, result (jsonb), executed_at, updated_at, created_at
```

### `action_outcomes`
```
id, action_id, user_id, event, meta (jsonb), created_at
```

### `keywords` (the portfolio / fuel tank)
```
id, user_id, host, keyword, intent, priority, rationale, coverage (int),
traffic_potential (int), competition (int), health (text default 'new'),
gsc_clicks (int), gsc_impressions (int), gsc_position (numeric), last_scored_at,
source (text default 'derived'  -- 'derived'|'gsc'|'user'|'research'),
last_synced_at, dead (bool default false),
unique(user_id, host, keyword)
```

### `keyword_history` (daily snapshots for climbing bars)
```
id, user_id, host, keyword, clicks (int), impressions (int), position (numeric),
recorded_on (date default current_date), created_at,
unique(user_id, host, keyword, recorded_on)
```

### `placements` (community/social placements)
```
id, user_id, host, platform, owned (bool), keyword, target_url, target_title, kind,
draft, status (ready|posted|skipped|paused|snoozed|failed), posted_at, next_eligible_at,
cooldown_days, meta (jsonb), engagement (jsonb), performance (text), last_checked_at,
followups (int), seen_reply_ids (jsonb default '[]'), reply_count (int)
```

### `notifications` (the Inbox)
```
id, user_id, host, kind (reply|opportunity|traction|cooling|published), priority (int),
title, body, placement_id, action_url, draft, status (unread|read|actioned|dismissed), created_at
```

### `activity` (Genie's live work log)
```
id, user_id, host, verb (scanning|discovered|writing|staged|learning|traction|retired|published|replied|keywords),
icon, message, detail, meta (jsonb), created_at
```

### `directory_contacts` (shared, growing contact directory) — SELECT policy is `authenticated` (shared read), writes via service role
```
id, email (unique), name, company, website, industry, role, source,
is_genie_lead (bool default false  -- separate category for Marketing-Genie's own prospects),
status (potential|active|client|unsubscribed|bounced), created_at
```

### `outreach_log` (per-user outreach record + reply tracking)
```
id, user_id, host, contact_email, contact_name, subject, body,
status (queued|sent|opened|replied|bounced|failed), email_id (resend id),
sent_at, replied_at, is_followup (bool), created_at
```

### Other tables
- `cadence_plans` — weekly cadence
- `chat_messages` — per-business Genie chat
- `safety_settings` — `user_id (PK), permission_level (int 1-4), kill_switch (bool), monthly_spend_cap (default 0)`

**If unsure a table/column exists, check Supabase and provide `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` SQL.**

---

## 8. FILE INVENTORY (what each thing does)

### Pages (`app/**/page.js`)
- `app/page.js` — landing/scan entry. After scan, routes first-time users to `/setup`.
- `app/login/page.js` — Supabase auth (Google OAuth + email).
- `app/welcome/page.js` — post-signup welcome.
- `app/setup/page.js` — **guided connect wizard + profile capture** (strength bar, teaching narration).
- `app/dashboard/page.js` — **clean home** + Settings/Integrations/History sub-views (via `?view=`). Contains `HomeView`, `SafetyCard`, `ProfileCard`, `ResetCard`, `PlatformGrid`.
- `app/dashboard/action/[id]/page.js` — single action detail (PostToX tap, TapPost, SendOutreach).
- `app/dashboard/scan/[id]/page.js` — scan detail.
- `app/research/page.js` — **THE merged Keywords page** (auto-loads picked keywords, pro table, tabs, research).
- `app/growth/page.js` — now just **redirects to `/research`** (Growth merged into Keywords).
- `app/tasks/page.js` — **daily ritual** (channel-by-channel: own → community → email).
- `app/notifications/page.js` — **Inbox** (replies + opportunities).
- `app/stories/page.js` — **Conversations** (Placement Story timeline). _Still on older kit styling._
- `app/business/page.js` — business overview (legacy-ish).
- `app/chat/page.js` — standalone chat.

### API routes (`app/api/**/route.js`) — key ones
- `keywords/route.js` — GET portfolio, POST derive (accepts `productOverride` to fix misreads), PATCH add-own, DELETE remove.
- `keywords/research/route.js` — GET (auto-load picked keywords as table), POST (discover+enrich a seed), PUT (add selected to portfolio).
- `keywords/sync/route.js` — POST (pull real GSC data, dead/new/swap), GET (daily history).
- `placements/route.js` — GET tap plan (own-first ordering), PATCH mark posted/skipped.
- `radar/reddit|quora|web/route.js` — find + write placements. Use `lib/radar-auth.js` (session OR cron via `x-genie-cron`).
- `outreach/send/route.js` — send one drafted outreach email.
- `outreach/campaign/route.js` — GET status/report, POST one-tap daily batch drip.
- `notifications/route.js` — GET inbox, POST scan replies+draft, PATCH mark.
- `activity/route.js` — GET live work feed.
- `home/route.js` — GET strength + today counts + honest traffic graph data.
- `profile/route.js` — GET/POST company/sender profile.
- `cron/genie/route.js` — the nightly orchestrator.
- `connect/google/*`, `connect/x/*`, `connect/wordpress/route.js` — OAuth flows. Google/X callbacks honor `genie_return=setup` cookie to return to wizard.
- `scans`, `actions`, `ai`, `audit`, `brief`, `safety`, `business/delete`, `chat`, `messages`, `content`, `distribute`, `cadence`, `community`, `opportunities`, `engagement`, `growth`, `stories` — supporting engines.

### Lib (`lib/*.js`)
- `ai-router.js` — `callAI({system, prompt, maxTokens, temperature})`, Gemini→Groq→OpenRouter fallback.
- `supabase/{client,server,admin}.js` — Supabase clients (browser / server / service-role).
- `audit.js`, `accuracy.js` — site scan (46 checks + PageSpeed).
- `business.js` — `businessesFromScans`, `hostOf`, `businessName`.
- `keyword-health.js` — `scoreKeyword`, `gradeKeyword`, `gradePortfolio`.
- `keyword-research.js` — `discoverKeywords` (Google Autocomplete), `enrichKeywords` (AI estimates + opportunity scoring + spark + ranking).
- `keyword-sync.js` — `syncKeywordsFromGsc` (real data reconcile).
- `cadence.js` — `buildTapPlan` (own-accounts-first ordering), daily caps, cooldowns.
- `search.js` — `webSearch`, `redditSearch` (DuckDuckGo HTML).
- `engagement.js` — read Reddit/generic engagement, classify winning/flat/dud.
- `replies.js` — `findNewReplies` (Reddit strong, others best-effort).
- `email-engine.js` — `DAILY_CAP`, `sentToday`, `sourceContacts`, `draftEmail`, `sendOne`.
- `activity.js` — `logActivity`, `logActivityBatch`.
- `google.js` — OAuth exchange/refresh, `getValidAccessToken`.
- `gsc.js` — `getGscData` (Search Console query).
- `markdown.js` — article → WordPress HTML.
- `x.js` — X OAuth/posting helpers (paid path retained, tap-to-post default).
- `radar-auth.js` — `resolveRadarUser` (session or cron service-mode).
- `outcomes.js` — action → outcome titles, impact styling.

### Components
- `components/shell/Rail.js` — left nav (MG logo + line icons). Nav: Home, Today's taps, Conversations, **Keywords**, Inbox, History, Connect, Settings.
- `components/shell/AppShell.js` — layout shell (rail + content + right Genie panel), minimal top bar.
- `components/shell/GeniePanel.js` — right-side Genie chat (platform-wide; do not rebuild).
- `components/ui/Logo.js` — uses `/public/logo.png` (owner uploaded the MG genie logo).
- `components/ui/Icon.js` — thin line-icon set (home/tasks/growth/search/etc).
- `components/ui/BrandIcon.js` — real brand marks (reddit/x/linkedin/medium/quora/wordpress/google/shopify/facebook/instagram/blog/mail/ads).
- `components/ui/GenieVoice.js` — `GenieSays` (typewriter), `GenieLine` (avatar + speech), `StrengthBar` (red→amber→green with %).
- `components/ui/kit.js` — older light-premium components (Card/Button/Badge/CountUp/Stat/LiveDot/Progress/Skeleton). Used by `/stories`.
- `components/ActivityFeed.js` — "Genie is working" live feed.

**Asset:** `public/logo.png` — the MG genie logo (owner-uploaded). Referenced as `/logo.png`.

---

## 9. STRENGTH BAR MATH (so it stays consistent)
Setup wizard weights (total 100): Google 35, X 12, WordPress/blog 12, Reddit 10, Quora 8, LinkedIn 8, profile 15.
Home strength (real connections only): Google 35, X 15, WordPress 15, sender_email 10, company_name 10.
Colors: red < 35, amber 35-84, green ≥ 85. Bar shows the % number.

## 10. EMAIL VOLUMES (decided)
Free = 15 emails/day, Pro = 50/day. Slow drip (spaced sends), never blasted. One tap sends the day's batch; cron also drips overnight. Daily report: sent / opened / replied.

---

## 11. KNOWN GAPS / IMMEDIATE TODOs (priority order)
1. **Directory is empty** — build contact discovery (find 15-50 real related contacts/day from public sources) OR let user import. Email engine is ready and waiting for data.
2. **Email compliance** — add unsubscribe footer + physical address before real cold sends (CAN-SPAM/GDPR).
3. **Resend domain verification** — verify a custom domain + set `BRIEF_FROM` for real deliverability (currently `onboarding@resend.dev`).
4. **Deploy + test the full flow live** — scan → setup wizard → keywords (research) → daily ritual → email → home. A lot was built rapidly; verify each screen renders and functions.
5. **Reskin `/stories`** and any legacy views to full ink/paper.
6. **Stripe + Free/Pro paywall** (schema ready via `profiles.plan` + caps).
7. **Google OAuth verification** (consent screen) + **token encryption** before public launch.
8. **Ads (Meta/Google)** — large, needs platform approvals.

---

## 12. GROUND RULES FOR THE NEXT ASSISTANT
- Deliver **complete paste-ready files** with exact paths. No diffs. No local-terminal assumptions.
- Always `npm run build` (or equivalent reasoning) and confirm "Compiled successfully" before delivering.
- Provide full SQL blocks (`IF NOT EXISTS`) for any schema change; the owner runs them in Supabase.
- Keep the honesty rules: tap-to-post for non-owned platforms, labeled estimates vs real data, no fake engagement, no em-dashes in copy.
- Keep the ink/paper + emerald design system, line icons, MG logo, Genie's warm teaching voice.
- Do NOT rebuild the right-side Genie chat panel (platform-wide already).
- Flag scope cuts and honest limitations loudly rather than overclaiming.
- The owner thinks big and wants each feature to feel like a complete product, not a stub.
