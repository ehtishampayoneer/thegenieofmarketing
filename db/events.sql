-- ============================================================================
-- Marketing Genie — THE EVENT LEDGER
-- One append-only stream of everything Genie and the user do. Deliberately
-- minimal: a single table is enough to give us observability, attribution,
-- learning, auditing, idempotency (dedupe_key), replay, and — later — Federated
-- Growth Memory. The existing activity/decisions/growth_memory tables remain as
-- specialized read-projections; this is the canonical write stream they mirror.
-- Additive only. Run once in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,   -- null = system event
  host        text,                                               -- the entity, when applicable
  type        text not null,          -- dotted namespace: activity.discovered | decision.aeo_gap |
                                       -- outcome.recorded | learning.recorded | action.published |
                                       -- conversion.recorded | system.cron.run | system.error
  actor       text not null default 'genie',   -- genie | user | system
  subject     text,                             -- human-readable "what", e.g. a title or keyword
  data        jsonb,                            -- payload
  dedupe_key  text,                             -- optional idempotency key (per user)
  created_at  timestamptz not null default now()
);

create index if not exists events_user_time_idx on public.events (user_id, created_at desc);
create index if not exists events_type_time_idx on public.events (type, created_at desc);
create index if not exists events_host_idx      on public.events (host);
create unique index if not exists events_dedupe_uidx on public.events (user_id, dedupe_key) where dedupe_key is not null;

alter table public.events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'events_own') then
    -- Users can read/insert their own events. System events (user_id null) are
    -- written by the service role (which bypasses RLS) and not exposed to users.
    create policy events_own on public.events
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
