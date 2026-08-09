-- ============================================================================
-- Marketing Genie — GENIE PAGES (hosted publishing)
-- A real, public, SEO/AEO-ready place Genie can publish articles for EVERY
-- business — not just the WordPress minority. Served at /p/<handle>/<slug>.
-- Run once in the Supabase SQL editor. Additive.
-- ============================================================================

create table if not exists public.published_pages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  action_id        uuid,                       -- the source action, when published from Approvals
  host             text not null,              -- the business "site" this belongs to
  handle           text not null,              -- URL handle (sanitized host) in /p/<handle>/...
  slug             text not null,              -- URL slug
  title            text not null,
  meta_description text,
  body_html        text not null,              -- pre-rendered, sanitized HTML (markdownToHtml)
  hero_image       text,                       -- optional hero image (URL or data URI)
  hero_alt         text,
  target_keyword   text,
  business_name    text,                       -- byline / author
  business_url     text,                       -- link back to the owner's real site
  status           text not null default 'published',  -- published | unpublished
  published_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (handle, slug)
);

-- FAQ pairs → FAQPage schema (AI engines quote FAQs most). Added incrementally so
-- it's safe whether you run this file fresh or re-run it after the table exists.
alter table if exists public.published_pages add column if not exists faq jsonb;

create index if not exists published_pages_handle_idx on public.published_pages (handle) where status = 'published';
create index if not exists published_pages_user_idx on public.published_pages (user_id, published_at desc);

alter table public.published_pages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'published_pages' and policyname = 'published_pages_own') then
    create policy published_pages_own on public.published_pages
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- The public page routes (/p/<handle>/<slug> and /p/<handle>) read PUBLISHED rows
-- via the service role (admin client), so anonymous visitors and search/AI crawlers
-- can load them; the RLS policy above governs authenticated owner access.
