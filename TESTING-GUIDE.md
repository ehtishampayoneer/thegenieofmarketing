# Marketing Genie — End-to-End Testing Guide

Test the whole product as a brand-new customer, from an empty account to a fully
working engine. Everything below runs on **real data** — there is no sample/demo
content anywhere anymore. Every screen shows a **truth badge** (`Live data` /
`Empty · no data yet` / `Disconnected`) so you always know what you're looking at.

---

## 0. Reset to a clean slate (do this first)

Your account may still hold rows from earlier testing. To test like it's never
been used:

1. Go to **`/diagnostics`**.
2. Click **"Factory reset this account"** (top-right) → confirm.
3. It wipes only *your* generated data (scans, keywords, approvals, placements,
   activity, learnings, events) and replays onboarding. **Your login and any
   connected accounts are kept.** It then sends you to `/welcome`.

> API called: `POST /api/diagnostics/reset`. It deletes `eq(user_id, you)` rows
> from `placements, actions, keywords, growth_memory, events, activity, scans`
> and sets `profiles.onboarding_completed = false`.

After reset, open `/diagnostics` again — every engine count should read **0**.
That is the "newly launched SaaS with zero data" state.

---

## 1. The first-run experience — `/welcome`

**Click:** enter a **real website** (e.g. your own, or `holos-new.vercel.app`) →
**Show me →**.

**What you should feel/see:**
- A live, first-person stream: *"Reading yoursite.com…" → "Read your site — you're
  X." → "Understanding what you sell…" → "Your real competitors: A, B, C." →
  "Scanning Reddit & Quora for buyers…" → "Checking what AI recommends…"*
- A reveal: *"I've met {you}. Here's how I'll grow you."* with your **real**
  business summary + three engines already in motion, then **"Let me go to work →"**.

**APIs called (in order):**
1. `POST /api/audit` — the real scan (business name, what you sell, competitors,
   growth summary, score). *This is the honest core — it really reads your site.*
2. `POST /api/scans` — persists the scan.
3. `GET /api/entity?host=…` — resolves what kind of entity you are.
4. Kickoff (fired in parallel, real): `POST /api/keywords`, `POST /api/radar/intent`,
   `POST /api/ai-search`.

**On "Let me go to work →":** sets `profiles.onboarding_completed = true` and routes
to `/today`.

**Expected data after this step:** at minimum a **scan** exists and **keyword
derivation** has started. Buyer-intent + AI-search runs may still be completing.

---

## 2. The home — `/today`

**Reads:** `GET /api/today` (aggregates scans, activity, actions, growth memory).

**Expected right after the first scan (jobs still running):**
- Badge: `Live data`.
- "Handled while you were away" may say *"A quiet night so far…"* — correct,
  because overnight jobs haven't run yet.
- "Needs you now" shows the count of **proposed actions** (may be 0 until the
  content/intent engines stage work).
- Your **growth score** from the scan appears.

**No first scan yet?** You'll see the honest empty state → *"Run my first scan →"*.

---

## 3. Growth — `/growth`

**Reads:** `GET /api/today` (for your host) → `GET /api/placements?host=` +
`GET /api/keywords?host=`.

**Expected:**
- **Keyword strategy** populates once `POST /api/keywords` finishes (usually within
  the first minute). If empty, use **"Build my keyword strategy →"** to derive now.
- **Opportunities** (staged buyer conversations) appear once
  `POST /api/radar/intent` finds openings. Each one = a real Reddit/Quora/forum
  thread. Approving one **copies the draft + opens the exact thread**.

> Buyer intent needs keywords to exist first, so Opportunities may lag Keywords by
> a run. If Opportunities stay empty, that engine found nothing high-intent this
> pass (honest) — it keeps hunting nightly.

---

## 4. AI Search — `/ai-search`

**Reads:** `GET /api/ai-search`.
**Expected:** your AI-visibility score + the gaps where ChatGPT/Perplexity/Google
AI recommend competitors instead of you. Empty until the first AI-search run
completes → *"Run my first scan →"*. Each gap is an approvable content play.

## 5. Conversations — `/conversations`
**Reads:** `GET /api/stories`. Every buyer conversation Genie is running, as a
living story (found → wrote → posted → reply). Empty until intent stages the first
openings.

## 6. Approvals — `/approvals`
**Reads:** `GET /api/approvals` (proposed `actions` + ready `placements`).
This is the one queue for everything that needs you: articles, social posts,
outreach emails, and community replies. Keyboard-driven (A/E/S).

## 7. Intelligence — `/learning`
**Reads:** `GET /api/learn`. What Genie learned from your results + the decision
ledger (every choice + why). Empty until posts land and outcomes come back.

## 8. Impact — `/impact`
**Reads:** `GET /api/impact`. Real revenue traced to Genie's actions. Starts as
the **"Connect your revenue"** state (real per-provider webhook URLs) until a sale
is recorded. Not a demo number — you must connect a provider or record a
conversion for anything to appear.

## 9. Trust Center — `/trust` · Connections — `/connections`
- Trust: per-channel autonomy (defaults to **Review** — safe) + emergency stop.
  Reads `GET /api/trust` + `GET /api/safety`.
- Connections: real OAuth status. Connecting Google/X now returns you to
  `/connections`. Reads `GET /api/connections/status`.

---

## 10. What creates an approval

An item appears in `/approvals` (and bumps the "Needs you" count on `/today`) when:
- The **content engine** drafts an article/social post → `actions` row (`proposed`).
- The **outreach engine** drafts an email → `actions` row (`proposed`).
- The **buyer-intent engine** stages a community reply → `placements` row (`ready`).

## 11. Publishing

From `/approvals`, approving:
- an **owned** item (article on your WordPress, or X post) → `POST /api/actions/{id}/execute`
  (real publish where connected) — subject to your Trust level.
- a **community** item → copies the draft + opens the thread; you paste & post,
  and it's logged via `POST /api/approvals/act`.

After publishing, an `activity` row is written → it shows in the right-hand **Live
Activity** rail and on `/diagnostics`.

## 12. Overnight

The nightly cron `GET /api/cron/genie` (scheduled in `vercel.json`) fans out to
`POST /api/jobs/entity` per entity, which runs the full pipeline in order
(keywords → intent → content → AI-search → learning). That's what fills "Handled
while you were away" the next morning. To simulate it now, you can hit the cron
endpoint with the `CRON_SECRET`.

---

## 13. Watch it all live — `/diagnostics`

The internal console (`GET /api/diagnostics`) shows, in real time:
- **System status** — each engine and how much it has produced for you.
- **API status** — which providers are configured in this environment (green =
  credentials present, red = missing). Anything red won't run for real yet.
- **Engine activity** — the most recent things Genie actually did.

Use this whenever you're unsure whether something is working — you should never
have to guess.

---

## Expected first-session summary

| Moment | Should happen |
|---|---|
| Reset | All `/diagnostics` counts → 0 |
| `/welcome` scan | Scan saved; business understood; engines kicked off |
| Land on `/today` | Growth score shows; "quiet night" is normal at first |
| ~1 min later | Keywords populate `/growth`; activity starts streaming |
| Intent run | Opportunities + Conversations appear; approvals may queue |
| Approve + publish | Activity logs it; (owned items publish where connected) |
| Overnight cron | "Handled while you were away" fills; learnings begin |

If any step shows **Disconnected**, you're signed out. If it shows **Empty** when
you expected data, check `/diagnostics` — the engine either hasn't run yet or its
provider is red (missing credentials).
