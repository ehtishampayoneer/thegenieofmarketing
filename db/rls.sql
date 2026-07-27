-- ============================================================================
-- ROW LEVEL SECURITY — verify + enable (run in the Supabase SQL editor)
-- ----------------------------------------------------------------------------
-- WHY: with the anon/auth key, any signed-in user could read or write another
-- user's rows on any table that does NOT have RLS enabled with an owner policy.
-- This is the single most important production-safety check. The service-role
-- cron/jobs bypass RLS by design, so enabling it here does NOT break background
-- work.
--
-- HOW: run PART 1 first and read the output. Any per-user table showing
-- rls_enabled = false (or 0 policies) is a hole. Then run PART 2 to close them.
-- PART 2 is idempotent — safe to re-run.
-- ============================================================================

-- ── PART 1 — AUDIT: RLS state + policy count for every public table ──────────
select
  c.relname                as table_name,
  c.relrowsecurity         as rls_enabled,
  count(p.polname)         as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy  p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relrowsecurity asc, c.relname;

-- ── PART 2 — ENABLE owner-only RLS on the per-user tables ────────────────────
-- Review PART 1 output before running. Each policy allows a row only when it
-- belongs to the current user (auth.uid() = user_id). profiles is keyed by id.
do $$
declare
  t text;
  user_tables text[] := array[
    'actions','action_outcomes','activity','cadence_plans','chat_messages',
    'connections','decisions','entities','events','growth_memory','keyword_history',
    'keywords','links','notifications','outreach_log','placements','safety_settings',
    'scans','suppressions'
  ];
begin
  foreach t in array user_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists mg_owner_all on public.%I', t);
      execute format(
        'create policy mg_owner_all on public.%I using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        t
      );
    end if;
  end loop;

  -- profiles: keyed by id, not user_id
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles enable row level security';
    execute 'drop policy if exists mg_owner_all on public.profiles';
    execute 'create policy mg_owner_all on public.profiles using (auth.uid() = id) with check (auth.uid() = id)';
  end if;
end $$;

-- ── DELIBERATELY EXCLUDED ────────────────────────────────────────────────────
-- directory_contacts is a SHARED, cross-user lead directory (outreach sources
-- contacts from it across users). Do NOT add a user_id policy — it would break
-- outreach. If you want it locked down, enable RLS with NO policy so ONLY the
-- service-role cron (which bypasses RLS) can read it, then confirm outreach still
-- sources contacts:
--   -- alter table public.directory_contacts enable row level security;
--
-- Re-run PART 1 afterwards to confirm every per-user table now shows
-- rls_enabled = true with at least one policy.
