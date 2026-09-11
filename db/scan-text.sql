-- ============================================================================
-- Marketing Genie — KEEP WHAT THE SCAN READ
--
-- The audit already extracts ~3000 characters of the site's own text and uses it
-- to work out what the business is, then throws it away. That is why the
-- understanding check asked owners for things printed on their own homepage:
-- the question generator only ever saw a dozen extracted fields, never the page.
--
-- Keeping the text means Genie can say "I can see your pricing starts at X, is
-- that right?" instead of "what are your prices?". The first sounds like an
-- employee who read the site. The second sounds like a form.
--
-- Text only, never raw HTML: this is the visible copy of a page the owner asked
-- Genie to read, it is what the AI already received, and storing whole documents
-- would bloat the row for no benefit.
--
-- Additive and safe to re-run.
-- ============================================================================

alter table public.scans add column if not exists page_text text;

comment on column public.scans.page_text is
  'Visible text the audit read from the site, capped ~3000 chars. Lets Genie confirm what it already saw instead of asking the owner for it.';
