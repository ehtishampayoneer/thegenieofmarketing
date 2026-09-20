-- ============================================================================
-- db/keys-check.sql
-- Read-only. Changes nothing.
--
-- db/core.sql was written from information_schema.columns, which describes
-- columns and nothing else. It therefore guesses at primary keys and declares
-- no foreign keys or indexes at all. This is the missing half: run it and paste
-- the result, and core.sql can be finished so a rebuild is a real copy of
-- production rather than a schema that merely holds the same data.
--
-- It returns one row per constraint or index, roughly 60-120 rows for this
-- database. If the result comes back at exactly 100 rows, the SQL editor has
-- truncated it — run the two halves separately using the WHERE clause noted at
-- the bottom, because a silently truncated dump is what caused a wrong
-- diagnosis once already.
-- ============================================================================

select
  c.conrelid::regclass::text                                as table_name,
  case c.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    else c.contype::text
  end                                                       as kind,
  c.conname                                                 as name,
  pg_get_constraintdef(c.oid)                               as definition
from pg_constraint c
join pg_namespace n on n.oid = c.connamespace
where n.nspname = 'public'

union all

-- Indexes that are not already listed above as a constraint.
select
  i.tablename,
  'INDEX',
  i.indexname,
  i.indexdef
from pg_indexes i
where i.schemaname = 'public'
  and not exists (
    select 1 from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public' and c.conname = i.indexname
  )

order by table_name, kind, name;

-- If truncated at 100 rows, run these two separately instead:
--   ...and c.contype in ('p','u')      -- first pass
--   ...and c.contype in ('f','c')      -- second pass
