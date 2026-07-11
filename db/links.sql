-- ============================================================================
-- Marketing Genie — TRACKED LINKS
-- Short, attributable links (/l/<id>) that log a click.recorded event then
-- redirect. Completes the funnel — impression → CLICK → conversion — across every
-- channel, not just owned ones. Minimal: id → destination. Additive; run once.
-- ============================================================================

create table if not exists public.links (
  id          text primary key,          -- short base64url id (in the /l/<id> path)
  user_id     uuid references auth.users(id) on delete cascade,
  host        text,
  url         text not null,             -- absolute destination (already UTM-tagged)
  channel     text,
  ref         text,                      -- originating decision id, when known
  created_at  timestamptz not null default now()
);

create index if not exists links_user_idx on public.links (user_id, created_at desc);

alter table public.links enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'links' and policyname = 'links_own') then
    create policy links_own on public.links
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Note: /l/<id> is resolved by the service role (admin client) so anonymous
-- visitors can be redirected; RLS above governs authenticated user access.
