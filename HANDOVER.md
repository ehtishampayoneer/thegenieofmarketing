# MARKETING GENIE — COMPLETE HANDOVER DOCUMENT

_Last updated: September 2026. Read this top to bottom before touching anything._

> **A warning about this file.** It went stale once already: it described V1
> screens (`/setup`, `/dashboard`, `/research`, `/tasks`, `/stories`) months
> after they became redirect stubs, and listed email compliance as missing
> after `lib/compliance.js` shipped. If you change what exists, change this
> file in the same commit. A handover doc nobody trusts is worse than none.

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
7. **Show progress** → Growth Score, rankings climbing, real traffic counted first-party, and revenue traced back to the page that earned it.

**Design language: Apple's system palette.** The old ink/paper + emerald scheme was
replaced wholesale (see `app/globals.css`). Light is systemGray6 `#F2F2F7` with white
cards and the apple.com text ramp (`#1D1D1F` / `#424245` / `#6E6E73`); Dark is true
black with the iOS elevation ladder (`#1C1C1E` → `#2C2C2E` → `#3A3A3C`). ONE accent,
systemBlue (`#0071E3` light, `#0A84FF` dark), with green/red/orange reserved strictly
for state. Separation is a hairline plus a value step, not a drop shadow.

Type is the platform's own face (`-apple-system`, so real SF Pro on Apple hardware);
there is no webfont, deliberately. The scale is 12 whole steps, 11-24px, with no
half-pixel sizes and no weight above 700. `lib/platform-craft.js` is the same idea
for copy: real per-platform limits, folds and mechanics.

The logo is DRAWN, not an image: `components/brand/GenieWordmark.js`. `/public/logo.png`
is retired because "MARKETING" was ~7.5% of that file's height and unreadable at any
size that fits a sidebar, and its black wordmark vanished on dark grounds.

Thin line icons (no emoji in UI), real brand marks for platforms, restrained motion.
Genie has a warm, plain-spoken voice. **NO em-dashes in user-facing copy.**

**Honesty is a core product principle (enforced in code):**
- Non-owned platforms (Reddit/Quora/LinkedIn/Medium/forums) use **tap-to-post** — Genie writes it and opens the page, the user taps to publish. NO silent auto-posting into strangers' threads (that gets accounts banned). This is deliberate and non-negotiable.
- Owned channels that DO auto-execute for real: **WordPress** (publishes articles) and **email** (sends via Resend).
- X posting is **tap-to-post** (X's API posting is paid ~$200/mo; we use the free intent/compose URL).
- Keyword volumes/CPC/difficulty/ranking are **AI estimates, clearly labeled**, until Google Search Console is connected — then REAL data replaces them. We never fake real Google numbers.
- No fake engagement / SMM panels ever (bought likes get products blacklisted and poison the learning loop).

---

## 2. CURRENT STAGE (what's built vs. what's left)

### ✅ BUILT & WORKING

**The shell.** `components/shell/v2/OperatorShell.js` is the app. 23 destinations in
three groups (Your employee / Growth journey / Settings), a live activity ticker,
Day/Night themes, `PageGuide` info button per screen, ⌘K chat.

**The nightly engine.** `/api/cron/genie` is a thin dispatcher that fans out ONE
isolated job per (user, host) to `/api/jobs/entity` → `lib/genie-jobs.js`. Each job is
idempotent (a done-event per day), has its own time budget and retries, so one slow
business cannot sink the run. Order matters and is documented in the file: pull real
GSC/GA4 data → re-grade and retire keywords → radars → AI-search → content → unstick
one stalled keyword → one pillar page → engagement → replies → outreach → learn, then
stale-page refresh and Gmail reply sync.

**Money layer.**
- **Buyer Hunt** (`/hunt`) — keyless intent sources (Hacker News via Algolia, Stack
  Exchange, GitHub) plus Reddit/Quora radars. Scores 0-100, drafts the reply, you post.
- **Revenue Recovery** (`/recover`) — upload old leads, per-contact win-backs.
- **Find clients** (`/prospects`) — `lib/prospects.js` names real companies, crawls
  their sites, and picks an address the company actually published. Never invents one.
- **Get featured** (`/featured`) — six plays on `lib/earned-media.js`, including
  "Place your video". Per-play persistence, dedupe, 60-day re-pitch gap.
- **Deal Pipeline** (`/pipeline`), **Inbox** (`/inbox`), **Proof Sprint** (`/sprint`).
- **Outreach** — `lib/email-engine.js`. Caps (Free 15/day, Pro 50/day), drip, unsubscribe
  + physical address in every send (`buildEmailHtml` + `lib/compliance.js`), suppression
  list, and DNS-level address verification before sending (`lib/email-verify.js`, which
  fails OPEN so a resolver outage cannot block all mail).

**Growth layer.** Growth Score, **AI Search Presence** (`/ai-search`, the wedge: asks
the real models whether you get named), Customer Impact, What Genie Learned, Foundation
links, Website Setup (read-only audit → copy-paste fixes, never edits their site),
Market Testing.

**Content engine.** `/api/content` now makes TWO calls: the article, then the social
posts *given the finished article*. They used to share one 3500-token budget with social
last in the schema, so social was written blind and into leftovers. `lib/platform-craft.js`
supplies per-platform mechanics. **Sharpen** (`/api/approvals/sharpen`) is an optional
second pass on one draft, button-only, never automatic, never saves by itself.

**On-site layer.** One snippet (`/api/embed`) the owner pastes into their OWN site:
counts real visits, catches leads, points at `profiles.money_page_url`. Beacons at
`/api/px/view` and `/api/px/lead`, rollups at `/api/traffic` (today / yesterday / 7 days,
in the viewer's timezone). Uploads bypass Vercel's 4.5MB body cap via a signed
direct-to-storage URL.

**Video** (`/video`) — transcribes (Groq Whisper, already configured) and returns
captions, chapters, three clip picks with real Whisper timestamps, and the first-party
facts said out loud. Deliberately does NOT write articles or social; that would duplicate
the content engine.

**Safety + honesty.** Trust ramp (review → assisted → auto, earned per channel, gated on
a content guard AND ≥80 confidence, fails closed), kill switch, spend cap, event ledger
(`lib/events.js`), provenance system (Verified / Estimated / Modelled), SSRF guard,
54 passing tests (`npx vitest run`).

**Docs in-app.** `/how-it-works` (whole product, plain words) and `/capabilities`
(flat feature list with honest status). Keep both in sync with reality.

### ❌ NOT BUILT / KNOWN LIMITS
- **Real keyword volumes** — still AI estimates. Needs Google Ads API approval.
- **Ads** — Genie drafts ad ideas, runs nothing. Meta/Google need platform approval.
- **Stripe / paywall** — `profiles.plan` and caps exist; no billing. **Note: Stripe does
  not operate in Pakistan.** Realistic options are Payoneer, Paddle (pays out via
  Payoneer), or a local gateway. Dodo Payments does NOT support Pakistani sellers.
- **Video posting** — Genie never uploads video anywhere. YouTube's API would allow it
  with a new OAuth scope; nothing else realistically does.
- **Country-level revenue attribution** — Market Testing tracks search only.
- **Resend domain verification** — verify a sending domain, or connect Gmail per-user.
- **Google OAuth verification** + **token encryption at rest** before public launch.

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

### `events` (THE LEDGER — `db/events.sql`)
Append-only stream of everything Genie and the user do. `user_id, host, type (dotted
namespace), actor, subject, data jsonb, dedupe_key, created_at`. Unique on
`(user_id, dedupe_key)` where present, which is what makes the nightly jobs idempotent.
Traffic and leads live here too (`traffic.pageview`, `lead.captured`) rather than in new
tables, with partial indexes from `db/onsite.sql`.

### Other tables
- `cadence_plans` — weekly cadence
- `chat_messages` — per-business Genie chat
- `safety_settings` — `user_id (PK), permission_level (int 1-4), kill_switch (bool), monthly_spend_cap (default 0)`
- `growth_memory`, `decisions` — the learning loop + decision ledger
- `published_pages`, `links`, `citation_targets`, `suppressions`, `keyword_usage`

### Migrations to run (in `db/`, all idempotent)
| File | Adds | Without it |
|---|---|---|
| `setup.sql`, `rls.sql`, `events.sql` | the base | nothing works |
| **`onsite.sql`** | `profiles.money_page_url` + pageview/lead indexes | money page + traffic panel + lead capture all dead |
| **`directory.sql`** | `directory_contacts` + unique email index + RLS | nightly outreach sends nothing, silently |

**If unsure a table/column exists, check Supabase and provide `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` SQL.**

---

## 8. FILE INVENTORY (what each thing does)

### Pages (`app/**/page.js`)
`app/page.js` redirects on the SERVER: signed in → `/today`, else → `/login`. First run
is `/welcome`.

**Your employee:** `today` · `approvals` · `hunt` · `recover` · `conversations` ·
`video` · `prospects` (Find clients) · `featured` · `inbox` · `pipeline` · `sprint`

**Growth journey:** `growth` · `ai-search` · `impact` · `learning` · `foundation` ·
`site` · `markets`

**Settings:** `connections` · `trust` · `settings` · `how-it-works` · `capabilities`

**Public:** `login` · `welcome` (onboarding, LIGHT stage) · `showcase` (pitch, LIGHT) ·
`verdict` (free AI-visibility check, no login) · `p/[handle]/[slug]` (published pages)

**Retired V1 stubs — redirects only, do not build on them:**
`research` · `tasks` · `notifications` · `stories` · `setup` · `dashboard` · `business`

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
- `components/brand/GenieWordmark.js` — **the logo**. Drawn, not an image: a geometric G
  monogram plus real text, so it is legible at any size and follows the theme. Retired:
  `components/ui/Logo.js` / `/public/logo.png`.
- `components/ui/Icon.js` — thin line-icon set (home/tasks/growth/search/etc).
- `components/ui/BrandIcon.js` — real brand marks (reddit/x/linkedin/medium/quora/wordpress/google/shopify/facebook/instagram/blog/mail/ads).
- `components/ui/GenieVoice.js` — `GenieSays` (typewriter), `GenieLine` (avatar + speech), `StrengthBar` (red→amber→green with %).
- `components/ui/v2/primitives.js` — **the current vocabulary** (Card, Pill, Button, Stat,
  Provenance, SectionHead). `components/ui/kit.js` is the retired V1 set.
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

**Fixed since the last version of this doc** (do not re-report these): email compliance
(unsubscribe + physical address ship in `buildEmailHtml`, suppression list in
`lib/compliance.js`); the empty contact directory (`lib/email-engine.js` now seeds it
from the prospects engine — see `seedDirectory()`); the V1→V2 screen migration; the
social-copy craft gap; the content engine's shared token budget.

1. **Run the migrations.** `db/onsite.sql` and `db/directory.sql`. Both are idempotent.
   Until they are run, the traffic panel, lead capture, the money page and the entire
   nightly outreach path are inert, and they fail QUIETLY, which is the dangerous part.

2. **Set the target customer.** `sourceContacts()` seeds the directory from the scan's
   `targetCustomer`. If that field describes what the business IS rather than who it
   SELLS TO, outreach will discover competitors instead of buyers. Highest-leverage
   single field in the product.

3. **Resend domain verification.** If still sending from `onboarding@resend.dev`, cold
   email largely lands in spam regardless of copy quality. Verify a domain, or connect
   Gmail per-user (which sidesteps it entirely and deliverability is better anyway).

4. **Buyer Hunt's segment skew.** Hacker News, GitHub and Software Recommendations are
   where developers are. A plumber, baker or rug retailer gets little from them. Reddit
   and Quora carry those segments; the trade-matched Stack Exchange sites help. This is
   the biggest remaining product gap for non-tech customers.

5. **Real keyword volumes** — Google Ads API approval.

6. **Payments** — see the Stripe/Pakistan note in section 2.

7. **Google OAuth verification + token encryption at rest** before public launch.

8. **Breadth risk.** 23 destinations, each good, none best-in-world. If adoption is soft,
   the honest question is whether three screens (find buyers asking now / write the thing
   / prove it made money) would beat twenty-three.

---

## 12. GROUND RULES FOR THE NEXT ASSISTANT
- Deliver **complete paste-ready files** with exact paths. No diffs. No local-terminal assumptions.
- Always `npm run build` (or equivalent reasoning) and confirm "Compiled successfully" before delivering.
- Provide full SQL blocks (`IF NOT EXISTS`) for any schema change; the owner runs them in Supabase.
- Keep the honesty rules: tap-to-post for non-owned platforms, labeled estimates vs real data, no fake engagement, no em-dashes in copy.
- Keep the Apple palette (`app/globals.css`), the drawn wordmark, line icons, and Genie's
  plain-spoken voice. No em-dashes in user-facing copy.
- Do NOT rebuild the right-side Genie chat panel (platform-wide already).
- Flag scope cuts and honest limitations loudly rather than overclaiming.
- The owner thinks big and wants each feature to feel like a complete product, not a stub.
