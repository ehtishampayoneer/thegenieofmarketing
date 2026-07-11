# Marketing Genie — Founder Roadmap

_A living document of foundational systems and strategic capabilities to build
**after** (or where essential, during) production readiness. Not the current
sprint — the company we're building. Maintained by the CTO/CPO as ideas surface,
so we never lose a great one and never lose focus._

**Legend** — Priority: P0 (foundational, do first) → P3 (later). Effort: S (days),
M (1–2 wk), L (3–4 wk), XL (multi-month). Each item: impact · approach ·
dependencies · effort · why · when to build.

---

## A. Company-operations systems (running Genie as a business)

### A1. Marketing Genie HQ — Internal Admin Platform
- **Priority:** P1 (start a thin slice at closed beta; expand with scale).
- **Business impact:** You can't run a SaaS you can't see. Users, MRR/ARR, churn,
  cost-per-customer, provider/queue health, errors, support — one operating view.
- **Approach:** *We already have the substrate* — the **Event Ledger** + usage
  metering. HQ is largely a set of admin-only read/rollup queries over `events`
  (signups, usage.*, conversion.*, system.*), plus billing data (from the billing
  provider, §A2) and infra metrics. Build as a separate admin app/route group gated
  by an allowlist of internal user IDs. Provider-agnostic dashboards; no per-metric
  new system — mostly projections of the ledger.
- **Dependencies:** Billing (§A2) for revenue; event ledger (done); a `plan`/`role`
  on profiles; feature flags (§A4).
- **Effort:** M for a thin slice (users, MRR, costs, health), L for the full HQ.
- **Why it matters:** Data-driven company decisions from day one; the difference
  between guessing and knowing. Compounds with everything (it reads the ledger).
- **When:** Thin slice at closed beta (users + costs + health). Full build post-beta.

### A2. Billing & Subscriptions (provider-agnostic)
- **Priority:** P0 for monetized launch (not closed beta).
- **Impact:** Revenue. Plans, quotas, trials, dunning.
- **Approach:** **Mirror the commerce-adapter pattern we already built** — a
  `BillingProvider` interface with thin adapters (Stripe, Paddle, Lemon Squeezy,
  …), a plans/quotas table, and webhook ingestion reusing the generic webhook
  route. Never coupled to one provider (per standing principle).
- **Dependencies:** `plan`/quota on profiles; usage metering (done) for
  metered/limit enforcement.
- **Effort:** L. **When:** Before public launch; not needed for a free closed beta.

### A3. Test + CI safety net _(recommended NOW as a standing companion)_
- **Priority:** P0.
- **Impact:** We take money/publish/spend actions; "it builds" is no longer enough
  assurance. Prevents regressions in the safety chain, attribution, and money paths.
- **Approach:** ~30 focused tests (publish-guard decisions, unsub tokens, SSRF
  guard, attribution math, entity classification, trust computation) + a GitHub
  Action running build+tests on push. No framework sprawl.
- **Effort:** S–M. **When:** In parallel with the production phase.

### A4. Feature flags & gradual rollout
- **Priority:** P1. **Impact:** Ship safely; beta-gate risky features (e.g.,
  enabling autonomous publishing per cohort). **Approach:** a simple flags table +
  `flag(user, key)` helper, later an admin toggle in HQ. **Effort:** S.
  **When:** Closed beta (to gate autonomy rollout).

### A5. Observability upgrade (Sentry/APM) + alerting
- **Priority:** P1. **Impact:** Know about failures before users do. **Approach:**
  add Sentry alongside the structured logs + health endpoint we have; alert on
  `system.error` spikes / provider degradation. **Effort:** S. **When:** Before
  onboarding real users.

### A6. Data retention, privacy & DPA (GDPR/CCPA)
- **Priority:** P1 (P0 for EU users). **Impact:** Legal. **Approach:** data export
  + delete-my-data flows (the ledger makes "everything about a user" queryable),
  retention windows, DPA, privacy policy, cookie consent. **Effort:** M.
  **When:** Before EU beta users.

---

## B. The moat systems (the founder's four)

### B1. Global Business & Contact Intelligence Network
- **Priority:** P1 (seed during production; compound forever).
- **Impact:** The biggest long-term moat — a knowledge network that gets smarter
  daily and no stateless competitor can replicate. Auto-discovers opportunities
  (companies, decision-makers, communities, podcasts, newsletters, influencers, PR,
  buying signals) for every user.
- **Approach:** A shared, privacy-safe `entities_global` graph populated as a
  *byproduct* of what Genie already does — every scan, radar hit, buyer-intent
  find, and directory/PR discovery writes normalized, **public-only** facts to a
  global store (deduped, provenance-tracked). The Buyer-Intent Radar + Discovery
  Universe become both consumers and contributors. Strictly public data + platform
  ToS + privacy law; per-user private data stays private (never pooled).
- **Dependencies:** Event ledger (done); the discovery engine (done); a global
  store (Postgres now, a graph/vector layer later); a compliance review.
- **Effort:** XL (but incremental — value from week one). **Why:** Compounding data
  advantage = durable defensibility. **When:** Seed the write-path during
  production (cheap); build query/enrichment layers post-beta.

### B2. Long-Term / Federated AI Memory
- **Priority:** P1.
- **Impact:** Genie gets smarter for *every* entity from what it learns across
  *all* similar entities (which outreach/content/AEO structures win, by
  entity-dimension). The compounding intelligence competitors can't copy.
- **Approach:** **We already emit the raw signal** — decisions + outcomes +
  learnings on the ledger, keyed to the entity *dimension profile*. Federated
  Memory aggregates these into privacy-safe **priors by dimension** (e.g., "for B2B
  SaaS, comparison pages win AEO citations") that `getBrief()` injects into new
  entities. Aggregate patterns only — never user content.
- **Dependencies:** Event ledger + entity dimensions + Learning Loop (all done).
- **Effort:** L. **Why:** Turns every user into leverage for every other user.
  **When:** Once we have enough entities/outcomes to generalize (post-beta).

### B3. Business Strategy Intelligence (autonomous Chief Growth Officer)
- **Priority:** P2 (the vision's north star).
- **Impact:** Genie graduates from executing marketing to advising strategy —
  positioning, pricing, competitive strategy, market/expansion opportunities,
  launch timing, demand forecasting, trend detection. Marketing becomes one module
  of a Growth OS.
- **Approach:** A strategy layer that reads the Entity Brain + Global Intelligence
  (B1) + Federated Memory (B2) + real outcomes, and produces explainable strategic
  recommendations (each an OpportunityCard with reasoning + expected impact). Built
  on the same substrate; it's a new *consumer* of the moat systems, not a new stack.
- **Dependencies:** B1, B2, strong outcome data.
- **Effort:** XL. **Why:** This is the category-defining endgame — the AI Chief
  Growth Officer. **When:** After the moat systems have real data.

---

## C. Discovered foundations (surfaced while building)

- **C1. Redis-backed limits/cache/queue** (P1, M) — swap the in-memory cache,
  budgets, rate-limits, and fan-out for Upstash Redis + QStash behind the existing
  interfaces (zero call-site changes) for hard global guarantees at scale.
  **When:** before high scale (dozens+ concurrent entities/night).
- **C2. Moderation-API adapter for brand safety** (P2, S) — replace the heuristic
  toxic list with a provider-agnostic moderation adapter for higher-recall brand
  protection. **When:** as autonomous publishing expands.
- **C3. Autonomous-publishing enablement** (P1, S) — the one hookup to let the
  Trust Ramp actually auto-publish trusted+confident content (execute-route
  cron-auth + a nightly step). Intentionally deferred until beta earns confidence.
- **C4. Per-user rate-limits & abuse prevention** (P1, M) — so Genie can't be used
  to spam/scrape; protects our IPs and reputation at scale.
- **C5. Multi-region / data residency** (P3, L) — when EU/enterprise demands it.
- **C6. In-app support + feedback loop** (P2, S) — capture beta feedback into the
  ledger; feeds HQ support metrics.

---

_Last updated: production phase kickoff. Update this file whenever a foundational
idea surfaces — priority, impact, approach, deps, effort, why, when._
