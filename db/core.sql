-- ============================================================================
-- MARKETING GENIE — CORE SCHEMA
-- ----------------------------------------------------------------------------
-- The fifteen tables everything else depends on. Until this file existed, no
-- SQL in this repository created them: profiles, scans, keywords, actions and
-- the rest existed only inside the live Supabase project. Losing that project
-- meant losing the schema, and there was no way to stand up a second
-- environment. Written 2026-09-20 from the live database's own
-- information_schema, not from memory.
--
-- The other ten tables are already covered and are NOT repeated here:
--   db/setup.sql       events, entities, growth_memory, decisions, links,
--                      suppressions, keyword_usage, citation_targets
--   db/directory.sql   directory_contacts
--   db/genie-pages.sql published_pages
--
-- SAFE TO RUN on a live database, and safe to run twice. Every statement is
-- "if not exists": it creates what is absent and adds columns that are missing,
-- and there is no drop, delete, update or truncate anywhere in it. Running it
-- against a healthy database does nothing at all.
--
-- ── COMPLETE ────────────────────────────────────────────────────────────────
-- Columns came from information_schema.columns; keys and indexes came from
-- pg_constraint and pg_indexes (db/keys-check.sql), both read off the live
-- database on 2026-09-20 and checked back against it rather than eyeballed.
-- Nothing in this file is inferred: the constraints at the bottom are the ones
-- production actually has, including the ON DELETE behaviour, which is the part
-- that would quietly differ if it were guessed.
-- ============================================================================


-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per signed-up account, keyed to Supabase's auth.users. The sender_*
-- and company_* columns are what outreach signs emails with; money_page_url is
-- where every article and post sends a buyer.
create table if not exists public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text,
  full_name                text,
  avatar_url               text,
  plan                     text not null default 'free',
  created_at               timestamptz not null default now(),
  onboarding_completed     boolean default false,
  onboarding_completed_at  timestamptz,
  logo_url                 text,
  money_page_url           text,
  sender_name              text,
  sender_email             text,
  company_name             text,
  company_website          text,
  company_phone            text,
  company_address          text,
  company_pitch            text,
  setup_completed          boolean default false
);
alter table public.profiles add column if not exists email                   text;
alter table public.profiles add column if not exists full_name               text;
alter table public.profiles add column if not exists avatar_url              text;
alter table public.profiles add column if not exists plan                    text not null default 'free';
alter table public.profiles add column if not exists onboarding_completed    boolean default false;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists logo_url                text;
alter table public.profiles add column if not exists money_page_url          text;
alter table public.profiles add column if not exists sender_name             text;
alter table public.profiles add column if not exists sender_email            text;
alter table public.profiles add column if not exists company_name            text;
alter table public.profiles add column if not exists company_website         text;
alter table public.profiles add column if not exists company_phone           text;
alter table public.profiles add column if not exists company_address         text;
alter table public.profiles add column if not exists company_pitch           text;
alter table public.profiles add column if not exists setup_completed         boolean default false;


-- ── scans ───────────────────────────────────────────────────────────────────
-- Every website scan. `ai` holds the business brief the whole engine reads from,
-- and `page_text` the extracted copy, so a rescan can be compared with the last.
create table if not exists public.scans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  url           text not null,
  final_url     text,
  overall_score integer,
  scores        jsonb,
  accuracy      integer,
  checks        jsonb,
  ai            jsonb,
  speed         jsonb,
  created_at    timestamptz not null default now(),
  gsc           jsonb,
  page_text     text
);
alter table public.scans add column if not exists final_url     text;
alter table public.scans add column if not exists overall_score integer;
alter table public.scans add column if not exists scores        jsonb;
alter table public.scans add column if not exists accuracy      integer;
alter table public.scans add column if not exists checks        jsonb;
alter table public.scans add column if not exists ai            jsonb;
alter table public.scans add column if not exists speed         jsonb;
alter table public.scans add column if not exists gsc           jsonb;
alter table public.scans add column if not exists page_text     text;


-- ── keywords ────────────────────────────────────────────────────────────────
-- What the business is trying to rank for. The gsc_* columns are real Search
-- Console numbers; `volume` is a real figure when Google Ads is connected and an
-- AI estimate otherwise, which is why `source` exists.
create table if not exists public.keywords (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  host              text not null,
  keyword           text not null,
  intent            text,
  priority          integer default 3,
  rationale         text,
  coverage          integer default 0,
  created_at        timestamptz not null default now(),
  traffic_potential integer,
  competition       integer,
  health            text default 'new',
  gsc_clicks        integer default 0,
  gsc_impressions   integer default 0,
  last_scored_at    timestamptz,
  source            text default 'derived',
  gsc_position      numeric default 0,
  last_synced_at    timestamptz,
  dead              boolean default false,
  volume            integer,
  volume_history    jsonb,
  ai_cited          boolean,
  ai_checked_at     timestamptz
);
alter table public.keywords add column if not exists intent            text;
alter table public.keywords add column if not exists priority          integer default 3;
alter table public.keywords add column if not exists rationale         text;
alter table public.keywords add column if not exists coverage          integer default 0;
alter table public.keywords add column if not exists traffic_potential integer;
alter table public.keywords add column if not exists competition       integer;
alter table public.keywords add column if not exists health            text default 'new';
alter table public.keywords add column if not exists gsc_clicks        integer default 0;
alter table public.keywords add column if not exists gsc_impressions   integer default 0;
alter table public.keywords add column if not exists last_scored_at    timestamptz;
alter table public.keywords add column if not exists source            text default 'derived';
alter table public.keywords add column if not exists gsc_position      numeric default 0;
alter table public.keywords add column if not exists last_synced_at    timestamptz;
alter table public.keywords add column if not exists dead              boolean default false;
alter table public.keywords add column if not exists volume            integer;
alter table public.keywords add column if not exists volume_history    jsonb;
alter table public.keywords add column if not exists ai_cited          boolean;
alter table public.keywords add column if not exists ai_checked_at     timestamptz;


-- ── keyword_history ─────────────────────────────────────────────────────────
-- A daily snapshot per keyword, which is what makes "you moved from 14 to 9"
-- a fact rather than a claim.
create table if not exists public.keyword_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  host        text not null,
  keyword     text not null,
  clicks      integer default 0,
  impressions integer default 0,
  position    numeric default 0,
  recorded_on date not null default current_date,
  created_at  timestamptz not null default now()
);
alter table public.keyword_history add column if not exists clicks      integer default 0;
alter table public.keyword_history add column if not exists impressions integer default 0;
alter table public.keyword_history add column if not exists position    numeric default 0;


-- ── actions ─────────────────────────────────────────────────────────────────
-- The approvals queue. `before_state` is what makes an action reversible, and
-- `status` is the only thing standing between a draft and the public internet.
create table if not exists public.actions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  scan_id        uuid,
  type           text not null,
  title          text,
  payload        jsonb,
  target         jsonb,
  status         text not null default 'proposed',
  auto_eligible  boolean default false,
  result         jsonb,
  before_state   jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  executed_at    timestamptz,
  rolled_back_at timestamptz,
  priority       text not null default 'medium'
);
alter table public.actions add column if not exists scan_id        uuid;
alter table public.actions add column if not exists title          text;
alter table public.actions add column if not exists payload        jsonb;
alter table public.actions add column if not exists target         jsonb;
alter table public.actions add column if not exists auto_eligible  boolean default false;
alter table public.actions add column if not exists result         jsonb;
alter table public.actions add column if not exists before_state   jsonb;
alter table public.actions add column if not exists updated_at     timestamptz not null default now();
alter table public.actions add column if not exists executed_at    timestamptz;
alter table public.actions add column if not exists rolled_back_at timestamptz;
alter table public.actions add column if not exists priority       text not null default 'medium';


-- ── action_outcomes ─────────────────────────────────────────────────────────
-- What happened after an action ran. The learning loop reads this.
create table if not exists public.action_outcomes (
  id         uuid primary key default gen_random_uuid(),
  action_id  uuid,
  user_id    uuid not null,
  event      text not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);
alter table public.action_outcomes add column if not exists action_id uuid;
alter table public.action_outcomes add column if not exists meta      jsonb;


-- ── activity ────────────────────────────────────────────────────────────────
-- The human-readable log every engine writes to. It is what the owner sees on
-- the floor and in "what Genie did", so an empty activity table is an honest
-- statement that nothing ran.
create table if not exists public.activity (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  host       text,
  verb       text not null,
  icon       text,
  message    text not null,
  detail     text,
  meta       jsonb,
  created_at timestamptz not null default now()
);
alter table public.activity add column if not exists host   text;
alter table public.activity add column if not exists icon   text;
alter table public.activity add column if not exists detail text;
alter table public.activity add column if not exists meta   jsonb;


-- ── connections ─────────────────────────────────────────────────────────────
-- OAuth grants and their tokens: Google, WordPress, X, the own-domain blog.
-- These are credentials. RLS below is what keeps one account's tokens away from
-- every other account, and nothing should ever loosen it.
create table if not exists public.connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  provider         text not null,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  scopes           text,
  google_email     text,
  gsc_site         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  meta             jsonb
);
alter table public.connections add column if not exists access_token     text;
alter table public.connections add column if not exists refresh_token    text;
alter table public.connections add column if not exists token_expires_at timestamptz;
alter table public.connections add column if not exists scopes           text;
alter table public.connections add column if not exists google_email     text;
alter table public.connections add column if not exists gsc_site         text;
alter table public.connections add column if not exists updated_at       timestamptz not null default now();
alter table public.connections add column if not exists meta             jsonb;


-- ── placements ──────────────────────────────────────────────────────────────
-- Everything Genie drafts for somewhere that is not the owner's own site: a
-- reply, a post, a pitch, a listing. `cooldown_days` and `next_eligible_at` are
-- what stop it behaving like a spammer on any one platform.
create table if not exists public.placements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  host              text not null,
  platform          text not null,
  owned             boolean default false,
  keyword           text,
  target_url        text,
  target_title      text,
  kind              text,
  draft             text,
  status            text default 'ready',
  posted_at         timestamptz,
  next_eligible_at  timestamptz,
  cooldown_days     integer default 7,
  meta              jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  engagement        jsonb,
  performance       text,
  last_checked_at   timestamptz,
  followups         integer default 0,
  seen_reply_ids    jsonb default '[]'::jsonb,
  reply_count       integer default 0
);
alter table public.placements add column if not exists owned            boolean default false;
alter table public.placements add column if not exists keyword          text;
alter table public.placements add column if not exists target_url       text;
alter table public.placements add column if not exists target_title     text;
alter table public.placements add column if not exists kind             text;
alter table public.placements add column if not exists draft            text;
alter table public.placements add column if not exists status           text default 'ready';
alter table public.placements add column if not exists posted_at        timestamptz;
alter table public.placements add column if not exists next_eligible_at timestamptz;
alter table public.placements add column if not exists cooldown_days    integer default 7;
alter table public.placements add column if not exists meta             jsonb;
alter table public.placements add column if not exists updated_at       timestamptz not null default now();
alter table public.placements add column if not exists engagement       jsonb;
alter table public.placements add column if not exists performance      text;
alter table public.placements add column if not exists last_checked_at  timestamptz;
alter table public.placements add column if not exists followups        integer default 0;
alter table public.placements add column if not exists seen_reply_ids   jsonb default '[]'::jsonb;
alter table public.placements add column if not exists reply_count      integer default 0;


-- ── outreach_log ────────────────────────────────────────────────────────────
-- Every email actually sent, and whether it was answered. sourceContacts() reads
-- this to make sure the same person is never emailed twice by the same owner.
create table if not exists public.outreach_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  host          text,
  contact_email text not null,
  contact_name  text,
  subject       text,
  body          text,
  status        text default 'queued',
  email_id      text,
  sent_at       timestamptz,
  replied_at    timestamptz,
  is_followup   boolean default false,
  created_at    timestamptz not null default now()
);
alter table public.outreach_log add column if not exists host         text;
alter table public.outreach_log add column if not exists contact_name text;
alter table public.outreach_log add column if not exists subject      text;
alter table public.outreach_log add column if not exists body         text;
alter table public.outreach_log add column if not exists status       text default 'queued';
alter table public.outreach_log add column if not exists email_id     text;
alter table public.outreach_log add column if not exists sent_at      timestamptz;
alter table public.outreach_log add column if not exists replied_at   timestamptz;
alter table public.outreach_log add column if not exists is_followup  boolean default false;


-- ── notifications ───────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  host         text,
  kind         text not null,
  priority     integer default 3,
  title        text not null,
  body         text,
  placement_id uuid,
  action_url   text,
  draft        text,
  status       text default 'unread',
  created_at   timestamptz not null default now()
);
alter table public.notifications add column if not exists host         text;
alter table public.notifications add column if not exists priority     integer default 3;
alter table public.notifications add column if not exists body         text;
alter table public.notifications add column if not exists placement_id uuid;
alter table public.notifications add column if not exists action_url   text;
alter table public.notifications add column if not exists draft        text;
alter table public.notifications add column if not exists status       text default 'unread';


-- ── safety_settings ─────────────────────────────────────────────────────────
-- One row per account, keyed by user_id rather than an id of its own. The kill
-- switch and the spend cap live here; the engine fails closed when it cannot
-- read them.
create table if not exists public.safety_settings (
  user_id           uuid primary key,
  permission_level  integer not null default 1,
  kill_switch       boolean not null default false,
  monthly_spend_cap numeric not null default 0,
  updated_at        timestamptz not null default now()
);
alter table public.safety_settings add column if not exists permission_level  integer not null default 1;
alter table public.safety_settings add column if not exists kill_switch       boolean not null default false;
alter table public.safety_settings add column if not exists monthly_spend_cap numeric not null default 0;
alter table public.safety_settings add column if not exists updated_at        timestamptz not null default now();


-- ── cadence_plans ───────────────────────────────────────────────────────────
-- The tap plan: what gets posted where, and in what order, without flooding any
-- one platform.
create table if not exists public.cadence_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  host       text not null,
  plan       jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cadence_plans add column if not exists plan       jsonb;
alter table public.cadence_plans add column if not exists updated_at timestamptz not null default now();


-- ── chat_messages ───────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  host       text not null,
  role       text not null,
  content    text not null,
  created_at timestamptz not null default now()
);


-- ── business_memory ─────────────────────────────────────────────────────────
-- A pgvector store from an earlier design. No code in this repository reads or
-- writes it, and it is kept only because the live database has it and dropping
-- a table to tidy up is not worth the risk. `embedding` is declared without a
-- dimension, which pgvector allows, because the live column does not say what
-- its dimension is and guessing one would be wrong in a way that only shows up
-- on the first insert.
create extension if not exists vector;
create table if not exists public.business_memory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  scan_id    uuid,
  content    text,
  embedding  vector,
  created_at timestamptz not null default now()
);


-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- db/setup.sql applies the owner-only policy to twenty-one tables and to
-- profiles. business_memory is in none of them: it is the one table with a
-- user_id that no file in this repository has ever protected. It holds scan
-- content, so it is protected here. The rest are left to setup.sql, which is
-- where they already are — two files fighting over one policy is how a policy
-- ends up in the state neither file intended.
alter table public.business_memory enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_memory' and policyname = 'mg_owner_all') then
    create policy mg_owner_all on public.business_memory
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;




-- ── KEYS ────────────────────────────────────────────────────────────────────
-- Foreign keys and unique constraints exactly as the live database has them.
-- The ON DELETE behaviour matters and is not uniform: deleting an account
-- cascades everything away, but deleting a scan only blanks actions.scan_id —
-- an approved action outlives the scan that suggested it, which is correct and
-- is the kind of detail a guessed schema gets wrong.
--
-- Postgres has no "add constraint if not exists", so each one is checked by
-- name first. Re-running this changes nothing.
do $$
declare r record;
begin
  for r in
    select * from (values
      -- every account-owned table hangs off auth.users and goes with it
      ('action_outcomes', 'action_outcomes_user_id_fkey',  'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('actions',         'actions_user_id_fkey',          'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('activity',        'activity_user_id_fkey',         'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('business_memory', 'business_memory_user_id_fkey',  'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('cadence_plans',   'cadence_plans_user_id_fkey',    'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('chat_messages',   'chat_messages_user_id_fkey',    'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('connections',     'connections_user_id_fkey',      'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('keyword_history', 'keyword_history_user_id_fkey',  'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('keywords',        'keywords_user_id_fkey',         'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('notifications',   'notifications_user_id_fkey',    'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('outreach_log',    'outreach_log_user_id_fkey',     'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('placements',      'placements_user_id_fkey',       'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('safety_settings', 'safety_settings_user_id_fkey',  'foreign key (user_id) references auth.users(id) on delete cascade'),
      ('scans',           'scans_user_id_fkey',            'foreign key (user_id) references auth.users(id) on delete cascade'),

      -- an outcome belongs to its action and dies with it
      ('action_outcomes', 'action_outcomes_action_id_fkey', 'foreign key (action_id) references public.actions(id) on delete cascade'),
      -- but an action OUTLIVES the scan that proposed it: set null, not cascade
      ('actions',         'actions_scan_id_fkey',           'foreign key (scan_id) references public.scans(id) on delete set null'),
      ('business_memory', 'business_memory_scan_id_fkey',   'foreign key (scan_id) references public.scans(id) on delete cascade'),

      -- one row per thing, which is what makes the engine's upserts idempotent
      ('cadence_plans',   'cadence_plans_user_id_host_key',                      'unique (user_id, host)'),
      ('connections',     'connections_user_id_provider_key',                    'unique (user_id, provider)'),
      ('keyword_history', 'keyword_history_user_id_host_keyword_recorded_on_key', 'unique (user_id, host, keyword, recorded_on)'),
      ('keywords',        'keywords_user_id_host_keyword_key',                   'unique (user_id, host, keyword)')
    ) as t(tbl, cname, cdef)
  loop
    if not exists (
      select 1 from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.conname = r.cname
    ) then
      execute format('alter table public.%I add constraint %I %s', r.tbl, r.cname, r.cdef);
    end if;
  end loop;
end $$;


-- ── INDEXES ─────────────────────────────────────────────────────────────────
-- Every index the live database has on these fifteen tables. Each one answers a
-- query the engine runs on a schedule, so a rebuild without them would work and
-- then get slower and slower as the tables fill.
create index if not exists action_outcomes_action_idx   on public.action_outcomes (action_id, created_at desc);
create index if not exists actions_user_status_idx      on public.actions (user_id, status, created_at desc);
create index if not exists actions_user_priority_idx    on public.actions (user_id, priority, created_at desc);
create index if not exists activity_user_time_idx       on public.activity (user_id, host, created_at desc);
create index if not exists chat_messages_user_host_idx  on public.chat_messages (user_id, host, created_at);
create index if not exists kw_history_idx               on public.keyword_history (user_id, host, keyword, recorded_on desc);
create index if not exists notifications_user_status_idx on public.notifications (user_id, status, priority, created_at desc);
create index if not exists outreach_user_idx            on public.outreach_log (user_id, host, status, created_at desc);
create index if not exists placements_user_host_idx     on public.placements (user_id, host, status, created_at desc);
create index if not exists placements_platform_day_idx  on public.placements (user_id, platform, posted_at);
create index if not exists scans_user_created_idx       on public.scans (user_id, created_at desc);

-- NOT recreated on purpose: connections_user_provider_uidx. The live database
-- carries both that unique index and the connections_user_id_provider_key
-- unique constraint above, on the same two columns — the constraint builds its
-- own index, so the second one is a duplicate that every token refresh pays to
-- maintain and no query needs. A rebuild should not inherit it. Dropping it on
-- the live database is safe but is a change to production, so it is left as a
-- decision rather than done quietly here:
--   drop index if exists public.connections_user_provider_uidx;


-- ── AFTER RUNNING THIS ──────────────────────────────────────────────────────
-- Run db/setup.sql too. Between them the twenty-five tables exist, with their
-- real keys and indexes, and every one with a user_id is behind row level
-- security.
