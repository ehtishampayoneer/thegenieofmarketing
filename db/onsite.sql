-- ============================================================================
-- Marketing Genie — THE ON-SITE LAYER
-- Genie's job is to find or convince a buyer and then send them to the place
-- where the deal closes. Two things were missing for that:
--
--   1. money_page_url — the ONE place the owner wants buyers to land (their
--      pricing/packages page, their checkout, or their contact form). Genie
--      never handles payment; it points at whatever the owner already sells
--      through. Every article CTA, outreach email and on-site prompt uses this,
--      UTM-tagged, so a sale traces back to the effort that earned it.
--
--   2. Traffic + lead capture on the owner's OWN site. The conversion pixel
--      already told us when a sale happened; nothing told us how many people
--      showed up, or caught the ones who weren't ready to buy yet. Both now
--      arrive as events on the existing ledger, so no new tables are needed —
--      only the two indexes below, which keep the "today / yesterday / 7 days"
--      rollups fast once the event stream gets large.
--
-- Additive only. Safe to re-run. Run once in the Supabase SQL editor.
-- ============================================================================

-- ── 1. Where buyers should land ──────────────────────────────────────────────
alter table public.profiles add column if not exists money_page_url text;

comment on column public.profiles.money_page_url is
  'Where Genie sends buyers to close: pricing/packages page, checkout, or contact form. Genie never processes payment.';

-- ── 2. Keep the traffic rollups fast ─────────────────────────────────────────
-- The traffic panel asks: "events of type traffic.pageview, for this user, since
-- midnight". The existing events_user_time_idx covers (user_id, created_at) but
-- still scans every event type for that user. This partial index keeps pageview
-- rollups cheap no matter how noisy the rest of the ledger gets.
create index if not exists events_pageview_idx
  on public.events (user_id, created_at desc)
  where type = 'traffic.pageview';

-- Lead capture reads the same way.
create index if not exists events_lead_idx
  on public.events (user_id, created_at desc)
  where type = 'lead.captured';
