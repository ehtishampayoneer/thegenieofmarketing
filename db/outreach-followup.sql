-- ============================================================================
-- OUTREACH: FOLLOW-UPS, AND WHERE THE ADDRESS CAME FROM
-- ----------------------------------------------------------------------------
-- Paste into Supabase → SQL Editor → Run. Safe to run as many times as you like:
-- it only ADDS what is missing and never drops or overwrites anything.
--
-- WHY. Two things the outreach log could not answer.
--
-- 1. "Is this a first email or a follow-up, and which one?"  A first cold email
--    gets a reply 1-3% of the time; two follow-ups roughly double that. Genie
--    sent once and stopped, which threw away about half the results of the
--    channel it leads with. `is_followup` existed in some databases and was read
--    and written by nothing. It is created here if missing, and the step number
--    is what lets the nightly run tell email two from email three.
--
-- 2. "Where did you get this address?"  Canada allows a cold message to an
--    address the recipient conspicuously published; Germany and most of the EU
--    expect the same published-source basis plus an opt-out. All of them ask
--    that question about a message you may have sent months ago, so the answer
--    has to live on the send record, not only on the contact row — which is
--    shared, and which may have been changed since.
-- ============================================================================

alter table public.outreach_log add column if not exists is_followup    boolean not null default false;
alter table public.outreach_log add column if not exists followup_step  smallint not null default 0;
alter table public.outreach_log add column if not exists source         text;
alter table public.outreach_log add column if not exists body           text;

-- The follow-up sweep reads every message sent to one person, for one owner, to
-- work out which step they are on. Without this it is a full scan every night.
create index if not exists outreach_log_user_contact_idx
  on public.outreach_log (user_id, contact_email, created_at desc);

-- "Who has not replied yet" is the other question the sweep asks.
create index if not exists outreach_log_user_unreplied_idx
  on public.outreach_log (user_id, sent_at desc)
  where replied_at is null;

-- ── CHECK ────────────────────────────────────────────────────────────────────
-- Run this after and read the result: every row should say 'ok'.
select
  c.column_name,
  case when c.column_name is null then 'MISSING' else 'ok' end as status
from (values ('is_followup'), ('followup_step'), ('source'), ('body')) as want(name)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name   = 'outreach_log'
 and c.column_name  = want.name;
