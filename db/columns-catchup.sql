-- ============================================================================
-- Marketing Genie — COLUMN CATCH-UP
--
-- Found by /diagnostics, which now checks every column the code uses.
--
-- 1. profiles: the company and sender fields were never added to the live
--    database. Every save of them failed quietly: onboarding's "company name /
--    sending email" step, Settings, and the signature on outreach emails.
--
-- 2. directory_contacts: this table already existed from an older version, so
--    db/directory.sql ("create table if not exists") skipped it entirely and its
--    newer columns were never added. Filling the contact directory writes those
--    columns, so it failed, and nightly outreach found no one to email.
--
-- Additive only. Never drops, renames or rewrites data. Safe to run twice.
-- ============================================================================

alter table public.profiles add column if not exists sender_name      text;
alter table public.profiles add column if not exists sender_email     text;
alter table public.profiles add column if not exists company_name     text;
alter table public.profiles add column if not exists company_website  text;
alter table public.profiles add column if not exists company_phone    text;
alter table public.profiles add column if not exists company_address  text;
alter table public.profiles add column if not exists company_pitch    text;
alter table public.profiles add column if not exists setup_completed  boolean default false;

alter table public.directory_contacts add column if not exists email         text;
alter table public.directory_contacts add column if not exists name          text;
alter table public.directory_contacts add column if not exists company       text;
alter table public.directory_contacts add column if not exists domain        text;
alter table public.directory_contacts add column if not exists industry      text;
alter table public.directory_contacts add column if not exists email_type    text default 'role';
alter table public.directory_contacts add column if not exists is_genie_lead boolean not null default false;
alter table public.directory_contacts add column if not exists status        text not null default 'new';
alter table public.directory_contacts add column if not exists source        text default 'discovery';
alter table public.directory_contacts add column if not exists created_at    timestamptz not null default now();

create index if not exists directory_contacts_domain_idx on public.directory_contacts (domain);

-- Supabase caches the table shapes; this makes the app see the new columns now
-- instead of after the cache next refreshes.
notify pgrst, 'reload schema';

-- Check: both rows should say 8 and 10.
select 'profiles' as table_name, count(*) as columns_added
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles'
   and column_name in ('sender_name','sender_email','company_name','company_website','company_phone','company_address','company_pitch','setup_completed')
union all
select 'directory_contacts', count(*)
  from information_schema.columns
 where table_schema = 'public' and table_name = 'directory_contacts'
   and column_name in ('email','name','company','domain','industry','email_type','is_genie_lead','status','source','created_at');
