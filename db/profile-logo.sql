-- ============================================================================
-- Marketing Genie — PROFILE LOGO
-- A logo URL for the business, shown at the top of outreach emails so they look
-- like a real person from a real brand. Additive and idempotent — run once in
-- the Supabase SQL editor.
-- ============================================================================

alter table if exists public.profiles
  add column if not exists logo_url text;
