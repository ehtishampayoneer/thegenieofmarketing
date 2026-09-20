-- ============================================================================
-- db/directory-check.sql
-- Read-only. Changes nothing. Run this BEFORE db/directory-fix.sql and read the
-- four answers: they say whether the fix is needed and whether it can be applied
-- cleanly, rather than finding out halfway through.
-- ============================================================================

-- 1. What is actually in the table right now?
select 'rows in directory' as question, count(*)::text as answer
from public.directory_contacts

union all

-- 2. Duplicate addresses? This is the only thing that can make the fix fail:
--    a unique index on (email) cannot be built while two rows share one.
--    "0" means the fix will apply cleanly.
select 'duplicate emails (must be 0)',
       coalesce((select count(*)::text from (
         select email from public.directory_contacts
         group by email having count(*) > 1
       ) d), '0')

union all

-- 3. Which of the missing columns are still missing?
select 'missing columns',
       coalesce(nullif(concat_ws(', ',
         case when not exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='directory_contacts' and column_name='domain')
           then 'domain' end,
         case when not exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='directory_contacts' and column_name='email_type')
           then 'email_type' end
       ), ''), 'none — already fixed')

union all

-- 4. Is the index the upsert needs already there?
select 'plain email unique index',
       case when exists (
         select 1 from pg_indexes
         where schemaname='public' and tablename='directory_contacts'
           and indexdef ilike '%unique%(email)%'
       ) then 'present' else 'missing' end;
