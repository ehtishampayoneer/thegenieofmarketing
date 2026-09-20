-- ============================================================================
-- db/directory-fix.sql
-- ── THE THREE THINGS THE LIVE directory_contacts IS MISSING ──
--
-- Found by reading the live schema (Sep 2026): the table was created by an
-- older version and has no `domain` and no `email_type`, while seedDirectory()
-- in lib/email-engine.js inserts both. Every insert was therefore rejected, the
-- directory stayed empty, sourceContacts() found nobody, and outreach sent
-- nothing — with the reason thrown away by the caller, so it looked exactly
-- like a niche with no companies in it.
--
-- This is the minimum that fixes it. db/directory.sql would also work, but it
-- drops and recreates the RLS policy (which is what makes Supabase warn about
-- "destructive operations") and re-declares columns that are already there.
-- There is no reason to touch either.
--
-- Nothing here removes a table, a column, a policy or a row. The columns this
-- database has that the repo did not know about — `website` and `role` — are
-- left exactly as they are. Safe to run twice.
--
-- STEP 1 FIRST: run db/directory-check.sql and read the answer. If it reports
-- duplicate emails, the index below cannot be built until they are dealt with.
-- ============================================================================

-- 1 & 2. The two columns the seeder writes and the table does not have.
--        Both nullable, so existing rows are untouched and valid.
alter table public.directory_contacts add column if not exists domain     text;
alter table public.directory_contacts add column if not exists email_type text default 'role';

-- 3. The index the upsert infers against.
--    seedDirectory() writes with ON CONFLICT (email). Postgres matches that
--    against an index on the column itself; the existing directory_contacts_
--    email_uidx is on lower(email), which is an expression index and will NOT
--    satisfy it. Without this, every insert is rejected with "no unique or
--    exclusion constraint matching the ON CONFLICT specification" even after
--    the two columns above exist. Every write lowercases the address first, so
--    this index and the lower(email) one can never disagree.
create unique index if not exists directory_contacts_email_plain_uidx
  on public.directory_contacts (email);

-- 4. Backfill `domain` for any rows already in the table, from the `website`
--    column this database has. Only fills rows where domain is still empty, so
--    it cannot overwrite anything, and it is skipped entirely if `website`
--    turns out to be empty too.
update public.directory_contacts
   set domain = lower(
         regexp_replace(
           regexp_replace(website, '^https?://', '', 'i'),
           '^www\.|/.*$', '', 'gi'
         )
       )
 where domain is null
   and website is not null
   and website <> '';
