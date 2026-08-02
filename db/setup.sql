-- ============================================================================
-- MARKETING GENIE — ONE-SHOT SETUP / REPAIR
-- ----------------------------------------------------------------------------
-- Paste this WHOLE file into Supabase → SQL Editor → Run. It is SAFE to run
-- anytime and as many times as you like: it only ADDS what is missing and turns
-- on security. It NEVER drops, empties, or overwrites your data.
--
-- STEP 1 prints a report — read it. STEPs 2-4 do the work.
-- ============================================================================


-- ── STEP 1 — CHECK: do all expected tables exist? (read the result grid) ─────
-- Any row that says MISSING = that table was never created. If a CORE table is
-- missing (scans/keywords/actions/connections/profiles/…), tell your developer;
-- those are your base schema. The feature tables below get created by STEP 2.
with expected(name, kind) as (values
  ('profiles','core'),('scans','core'),('keywords','core'),('keyword_history','core'),
  ('actions','core'),('action_outcomes','core'),('activity','core'),('connections','core'),
  ('placements','core'),('outreach_log','core'),('notifications','core'),
  ('safety_settings','core'),('cadence_plans','core'),('chat_messages','core'),
  ('directory_contacts','core (shared)'),
  ('entities','feature'),('growth_memory','feature'),('decisions','feature'),
  ('events','feature'),('links','feature'),('suppressions','feature')
)
select e.name, e.kind,
       case when to_regclass('public.'||e.name) is null then 'MISSING' else 'ok' end as status
from expected e
order by status desc, e.kind, e.name;


-- ── STEP 2 — FEATURE TABLES (idempotent; created only if absent) ─────────────

-- Event ledger
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  host text, type text not null, actor text not null default 'genie',
  subject text, data jsonb, dedupe_key text,
  created_at timestamptz not null default now()
);
create index if not exists events_user_time_idx on public.events (user_id, created_at desc);
create index if not exists events_type_time_idx on public.events (type, created_at desc);
create index if not exists events_host_idx on public.events (host);
create unique index if not exists events_dedupe_uidx on public.events (user_id, dedupe_key) where dedupe_key is not null;

-- Entities / Growth memory / Decisions
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  host text not null, type text not null default 'business',
  dims jsonb, name text, confidence numeric, source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, host)
);
create table if not exists public.growth_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  host text, mkey text not null, insight text not null,
  weight numeric not null default 1, meta jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, host, mkey)
);
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  host text, kind text not null, choice text, rationale text,
  confidence numeric, meta jsonb, outcome text, metrics jsonb,
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create index if not exists entities_user_host_idx on public.entities (user_id, host);
create index if not exists growth_memory_user_host_idx on public.growth_memory (user_id, host);
create index if not exists decisions_user_host_idx on public.decisions (user_id, host, created_at desc);

-- Tracked links
create table if not exists public.links (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  host text, url text not null, channel text, ref text,
  created_at timestamptz not null default now()
);
create index if not exists links_user_idx on public.links (user_id, created_at desc);

-- Suppression list (unsubscribes)
create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null, reason text,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);
create index if not exists suppressions_user_email_idx on public.suppressions (user_id, email);

-- Keyword usage ledger — the spine of the keyword→content chain. Every time Genie
-- writes something (article, social post, community reply, email) that targets a
-- keyword, one row is recorded here. Powers the "used in …" trail on each keyword
-- and the "targets …" label on each piece, and makes coverage a real, auditable count.
create table if not exists public.keyword_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  host text not null,
  keyword text not null,
  role text not null default 'primary',   -- 'primary' | 'related'
  channel text not null,                   -- 'article' | 'social' | 'reply' | 'email'
  ref_type text,                           -- 'action' | 'placement'
  ref_id uuid,
  title text,
  url text,
  status text not null default 'proposed', -- proposed | approved | published | posted
  created_at timestamptz not null default now()
);
create index if not exists keyword_usage_user_kw_idx on public.keyword_usage (user_id, host, keyword);
create index if not exists keyword_usage_ref_idx on public.keyword_usage (ref_type, ref_id);
create unique index if not exists keyword_usage_dedupe_uidx on public.keyword_usage (user_id, keyword, channel, ref_id);


-- ── STEP 3 — RECENT COLUMNS (idempotent; add only if missing) ────────────────
alter table if exists public.keywords add column if not exists volume integer;
alter table if exists public.keywords add column if not exists volume_history jsonb;
-- source tags where a keyword came from (scan / research / user / gsc / aeo);
-- ai_cited + ai_checked_at record whether AI assistants cite you for it (per-keyword
-- AI-search result, refreshed each time the AI-search radar runs).
alter table if exists public.keywords add column if not exists source text;
alter table if exists public.keywords add column if not exists ai_cited boolean;
alter table if exists public.keywords add column if not exists ai_checked_at timestamptz;
alter table if exists public.profiles add column if not exists logo_url text;

-- Connections: ensure every column the OAuth flows read/write exists. Without
-- these, a Google connection can SAVE fine yet read back as "disconnected"
-- (the status check selects meta/gsc_site; a missing column throws and the whole
-- connections read fails). Adding them is safe on an existing table. Idempotent.
alter table if exists public.connections add column if not exists access_token text;
alter table if exists public.connections add column if not exists refresh_token text;
alter table if exists public.connections add column if not exists token_expires_at timestamptz;
alter table if exists public.connections add column if not exists scopes text;
alter table if exists public.connections add column if not exists google_email text;
alter table if exists public.connections add column if not exists gsc_site text;
alter table if exists public.connections add column if not exists meta jsonb;
alter table if exists public.connections add column if not exists updated_at timestamptz default now();
-- The connect flows upsert with onConflict (user_id, provider); that REQUIRES a
-- unique index on those columns or the upsert errors out (→ "couldn't save").
create unique index if not exists connections_user_provider_uidx on public.connections (user_id, provider);


-- ── STEP 3b — ATOMIC COVERAGE ────────────────────────────────────────────────
-- Coverage was advanced with read-then-write from the app (select coverage, then
-- update coverage+1). Two pieces of content finishing at the same moment both read
-- the same value and one increment is silently lost. This does it in ONE statement,
-- so concurrent updates can't collide. security invoker = RLS still applies, so a
-- user can only ever touch their own keywords.
create or replace function public.increment_keyword_coverage(p_user uuid, p_host text, p_keyword text)
returns integer
language sql
security invoker
as $$
  update public.keywords
     set coverage = coalesce(coverage, 0) + 1
   where user_id = coalesce(auth.uid(), p_user)
     and host = p_host
     and keyword = p_keyword
  returning coverage;
$$;


-- ── STEP 4 — SECURITY: owner-only Row Level Security on per-user tables ───────
-- Without this, any signed-in user could read another user's data. The service
-- role (cron/background jobs) bypasses RLS by design, so this does NOT break the
-- overnight engine. Idempotent. directory_contacts is EXCLUDED on purpose (it's
-- a shared cross-user lead directory used by outreach).
do $$
declare
  t text;
  user_tables text[] := array[
    'actions','action_outcomes','activity','cadence_plans','chat_messages',
    'connections','decisions','entities','events','growth_memory','keyword_history',
    'keywords','keyword_usage','links','notifications','outreach_log','placements','safety_settings',
    'scans','suppressions'
  ];
begin
  foreach t in array user_tables loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists mg_owner_all on public.%I', t);
      execute format('create policy mg_owner_all on public.%I using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    end if;
  end loop;

  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles enable row level security';
    execute 'drop policy if exists mg_owner_all on public.profiles';
    execute 'create policy mg_owner_all on public.profiles using (auth.uid() = id) with check (auth.uid() = id)';
  end if;
end $$;


-- ── DONE. Re-run STEP 1 (the SELECT at the top) to confirm no CORE table is
--    MISSING. If one is, that's the only thing left to create — send the list
--    to your developer and it can be generated exactly.
-- ============================================================================
