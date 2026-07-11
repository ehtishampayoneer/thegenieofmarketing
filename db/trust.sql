-- ============================================================================
-- Marketing Genie — Trust & Safety: suppression list (outreach compliance)
-- Run once in the Supabase SQL editor. Additive.
-- (Trust levels, autonomy decisions, and provider/health state all live on the
--  events ledger — no tables needed. Only the suppression list needs a table, for
--  reliable, fast, legally-required opt-out enforcement.)
-- ============================================================================

create table if not exists public.suppressions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null,
  reason     text,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create index if not exists suppressions_user_email_idx on public.suppressions (user_id, email);

alter table public.suppressions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'suppressions' and policyname = 'suppressions_own') then
    create policy suppressions_own on public.suppressions
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- The unsubscribe endpoint writes via the service role (no session), which
-- bypasses RLS by design.
