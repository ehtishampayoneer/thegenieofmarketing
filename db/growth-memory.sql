-- ============================================================================
-- Marketing Genie — Growth Memory + Decision Ledger + Entities
-- Run once in the Supabase SQL editor. Additive only: no existing table is
-- touched. Code degrades gracefully until these exist, so deploy order is safe.
-- ============================================================================

-- 1) ENTITIES — what Genie is growing (business, saas, artist, restaurant, …).
--    One row per (user, host). `type` drives the adaptive playbook in lib/entity.js.
create table if not exists public.entities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  host        text not null,
  type        text not null default 'business',
  dims        jsonb,
  name        text,
  confidence  numeric,
  source      text,                         -- user | inferred | fallback | stored
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, host)
);

-- 2) GROWTH MEMORY — durable learnings per entity. Upserted by (user, host, mkey)
--    so winning insights strengthen (weight) instead of duplicating.
create table if not exists public.growth_memory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  host        text,
  mkey        text not null,                -- stable key, e.g. 'best_channel'
  insight     text not null,                -- human-readable learning
  weight      numeric not null default 1,
  meta        jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, host, mkey)
);

-- 3) DECISIONS — the ledger: every choice Genie makes, why, and what happened.
--    Powers explainability now and the Learning Loop later.
create table if not exists public.decisions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  host        text,
  kind        text not null,                -- channel_pick | radar_pick | content_topic | outreach | aeo_gap …
  choice      text,
  rationale   text,
  confidence  numeric,
  meta        jsonb,
  outcome     text,                         -- filled in later by the learning loop
  metrics     jsonb,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists entities_user_host_idx      on public.entities (user_id, host);
create index if not exists growth_memory_user_host_idx on public.growth_memory (user_id, host);
create index if not exists decisions_user_host_idx     on public.decisions (user_id, host, created_at desc);

-- ── Row Level Security: each user sees only their own rows ──
alter table public.entities      enable row level security;
alter table public.growth_memory enable row level security;
alter table public.decisions     enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'entities' and policyname = 'entities_own') then
    create policy entities_own on public.entities
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'growth_memory' and policyname = 'growth_memory_own') then
    create policy growth_memory_own on public.growth_memory
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'decisions' and policyname = 'decisions_own') then
    create policy decisions_own on public.decisions
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Note: the service-role key (cron/system jobs) bypasses RLS by design, so the
-- overnight loop can read/write memory on the user's behalf.
