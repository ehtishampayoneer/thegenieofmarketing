# Getting Marketing Genie running

The app is code-complete and deployed. This is the checklist to make it actually
*do* things. Work top to bottom — each tier unlocks more. You can stop after any
tier and the app still works (later features just stay dark until you wire them).

The single source of truth for "is it live?" once you start is the in-app
**`/diagnostics`** page — it shows what's connected and what the engine is doing.

---

## TIER 0 — Boot & login  (≈30 min)

1. **Create a Supabase project** (or use your existing one).
2. **Create the database tables.** Run these in Supabase → SQL Editor:
   - your base schema (the core tables: `scans, keywords, actions, activity,
     connections, profiles, placements, outreach_log, entities, decisions,
     notifications, safety_settings`, …)
   - then each file in `db/`: `events.sql`, `growth-memory.sql`, `links.sql`,
     `trust.sql`, `keyword-volume.sql`, `profile-logo.sql`
   - then **`db/rls.sql`** — run PART 1, read the output, then PART 2. This locks
     each user to their own rows. **Do not skip this before real users.**
3. **Enable Auth providers** in Supabase → Authentication → Providers:
   - Email (password) — on.
   - Google — on; paste a Google OAuth client id/secret (this is the *login*
     Google, separate from the "connect Google" in Tier 2).
   - Add your site URL + `https://YOURDOMAIN/auth/callback` to the allowed
     redirect URLs (Authentication → URL Configuration).
4. **Set the Tier 0 env vars** on Vercel (see `.env.example`): the 3 Supabase
   keys + `APP_URL`. Redeploy.

✅ Check: visit the site, create an account, log in, land on `/today` (empty).

---

## TIER 1 — The brain + the nightly engine  (≈15 min)

5. **Add one AI key** (Tier 1 in `.env.example`). Gemini or Groq free tier is the
   easiest — `GEMINI_API_KEY` from https://aistudio.google.com/apikey.
6. **Set `CRON_SECRET`** to any long random string. Vercel automatically sends it
   to the nightly cron; the engine won't run without it.
7. Redeploy.

✅ Check: go to `/welcome`, run a scan on a real website. You should see the live
reveal, then real keywords + drafted content appear in `/growth` and `/approvals`.
This is the core loop working end to end.

---

## TIER 2 — Act: publish, email, connect accounts  (≈1–2 hrs, mostly external signups)

8. **Email** — create a Resend account, verify a sending domain, set
   `RESEND_API_KEY` + `BRIEF_FROM`. (Outreach + the daily brief.)
9. **Google connect** — create an OAuth client in Google Cloud Console with the
   redirect URI `https://YOURDOMAIN/api/connect/google/callback`; set the three
   `GOOGLE_CONNECT_*` vars. Unlocks Search Console, Analytics, Gmail-send, Keyword
   Planner.
10. **X connect** — create an app in the X developer portal with callback
    `https://YOURDOMAIN/api/connect/x/callback`; set the three `X_*` vars.

✅ Check: `/connections` shows each as connectable; connecting returns you to the
app and shows "Connected".

---

## TIER 3 — Enhancements (optional, anytime)

- `GOOGLE_ADS_DEVELOPER_TOKEN` (+ `GOOGLE_ADS_LOGIN_CUSTOMER_ID`) — real keyword
  search volumes.
- `SERPAPI_KEY` — live Reddit/Quora buyer discovery.
- `PAGESPEED_API_KEY` — real site-speed audits.
- `QSTASH_TOKEN` — durable job queue at higher scale.

---

## Who does what

**Your end (only you can):** Supabase project + SQL migrations + RLS, all env vars
on Vercel, external accounts (Resend, Google Cloud, X, AI provider), auth/redirect
config, and the final "does the real flow work" walkthrough on the live deploy.

**My end (code):** keep `/diagnostics` accurate as the readiness dashboard, fix
anything a real run surfaces, and adjust flows. Once your keys are in, tell me and
I'll help interpret `/diagnostics` and debug any flow that doesn't light up.
