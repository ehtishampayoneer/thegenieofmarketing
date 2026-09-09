-- ============================================================================
-- Marketing Genie — THE SHARED CONTACT DIRECTORY
--
-- lib/email-engine.js has always READ this table, and nothing anywhere has ever
-- written to it. It was also never defined in this repo, so on a fresh project
-- it may not exist at all. Either way the result is the same: the nightly
-- outreach run at /api/outreach/campaign sources zero contacts and sends zero
-- email, silently, every night.
--
-- This defines the table, and lib/email-engine.js now seeds it from the same
-- discovery engine /prospects already uses (real companies, emails read only
-- from the company's own published pages, never invented).
--
-- WHY SHARED, NOT PER-USER
-- Finding a real business and confirming a published contact address is slow and
-- costs AI calls. Two customers in the same industry should not each pay for the
-- same lookup. Rows carry no user_id: they are public business contact details,
-- not anyone's private list. Who has been emailed is tracked per user in
-- outreach_log, and who opted out in suppressions, so sharing the directory
-- never means sharing someone's outreach history.
--
-- Additive and safe to re-run.
-- ============================================================================

create table if not exists public.directory_contacts (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text,                       -- a person, when the site names one
  company       text,
  domain        text,
  industry      text,                       -- what sourceContacts() filters on
  -- 'named' (a person's address) converts far better than 'role' (info@, sales@).
  email_type    text default 'role',
  -- Marks rows collected for Marketing Genie's OWN outreach rather than a
  -- customer's. sourceContacts() excludes these, which is why it must default false.
  is_genie_lead boolean not null default false,
  -- new | sent | replied | unsubscribed | bounced. sourceContacts() skips the
  -- last two so a bad address is never retried across the whole customer base.
  status        text not null default 'new',
  source        text default 'discovery',   -- how the row got here, for auditing
  created_at    timestamptz not null default now()
);

-- One row per address. Discovery re-runs nightly and will keep meeting the same
-- companies, so this is what stops the table filling with duplicates.
create unique index if not exists directory_contacts_email_uidx
  on public.directory_contacts (lower(email));

-- sourceContacts() asks: fresh rows, for this industry, not opted out.
create index if not exists directory_contacts_industry_idx
  on public.directory_contacts (industry, status);

create index if not exists directory_contacts_created_idx
  on public.directory_contacts (created_at desc);

-- RLS: readable by any signed-in user (it is a shared directory), writable only
-- by the service role, which is how the seeder inserts. Matches the intent
-- already described in db/rls.sql.
alter table public.directory_contacts enable row level security;

drop policy if exists "directory readable by authenticated" on public.directory_contacts;
create policy "directory readable by authenticated"
  on public.directory_contacts for select
  to authenticated
  using (true);

-- No insert/update/delete policy on purpose. The service role bypasses RLS, so
-- only Genie's own server code can write here. A signed-in user cannot inject
-- addresses into everyone else's outreach pool.
