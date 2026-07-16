-- ============================================================================
-- Marketing Genie — KEYWORD SEARCH VOLUME
-- Real monthly search volume + 12-month history per keyword, from the Google Ads
-- Keyword Planner API (lib/google-ads.js). Additive and idempotent — run once in
-- the Supabase SQL editor. Until you run it, Genie falls back to AI estimates and
-- nothing breaks.
-- ============================================================================

alter table if exists public.keywords
  add column if not exists volume         integer,   -- avg monthly searches (Google)
  add column if not exists volume_history jsonb;      -- [{ y, m, v }] last 12 months → sparkline
