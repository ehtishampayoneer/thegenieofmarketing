// lib/selftest.js
// ── THE LIVE SELF-TEST ──
// Every other check in this repo runs where the real keys are not: tests fake the
// AI and Google, and a local build cannot sign in. That is exactly how features
// shipped that never worked in production. This runs INSIDE the deployed app, with
// the real keys, the real database and the owner's real Google connection, and
// exercises each engine end to end.
//
// Rules it keeps:
//   • Never emails anyone, publishes anything or posts anywhere. The one exception
//     is an optional test email to the owner's OWN address, only when they tick it.
//   • Calls Google directly and reports Google's own error text. Most of Genie's
//     helpers turn a failure into an empty list, which is right for the product and
//     useless for diagnosis: "found nothing" and "API not enabled" look the same.
//   • Each check imports what it needs itself, so one broken module fails one row,
//     not the whole page.
//
// Shape of a result: { status: "pass"|"warn"|"fail"|"skip", summary, fix?, details? }

const pass = (summary, details) => ({ status: "pass", summary, details });
const warn = (summary, fix, details) => ({ status: "warn", summary, fix, details });
const fail = (summary, fix, details) => ({ status: "fail", summary, fix, details });
const skip = (summary, fix) => ({ status: "skip", summary, fix });

const has = (k) => !!String(process.env[k] || "").trim();

// Google's error bodies say exactly what is wrong ("API has not been used in project
// … before or it is disabled"). Keep the useful sentence, drop the JSON noise.
async function googleError(res) {
  let text = "";
  try { text = await res.text(); } catch {}
  let msg = text;
  try { const j = JSON.parse(text); msg = j?.error?.message || j?.error_description || j?.error || text; } catch {}
  return `HTTP ${res.status}: ${String(msg).replace(/\s+/g, " ").slice(0, 300)}`;
}
function enableHint(message, apiName) {
  return /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(message)
    ? `Enable "${apiName}" in Google Cloud → APIs & Services → Library, wait two minutes, then run this check again.`
    : null;
}
async function gget(url, token, extra = {}) {
  return fetch(url, { ...extra, headers: { Authorization: `Bearer ${token}`, ...(extra.headers || {}) }, signal: AbortSignal.timeout(20000) });
}

// ── Context, loaded once per request ────────────────────────────────────────
export async function loadContext(supabase, userId) {
  const ctx = { supabase, userId, scan: null, ai: {}, host: "", profile: {}, conn: null };
  try {
    const { data } = await supabase.from("scans").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      const { hostOf } = await import("@/lib/business");
      ctx.scan = data; ctx.ai = data.ai || {}; ctx.host = hostOf(data);
    }
  } catch {}
  try { const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle(); ctx.profile = data || {}; } catch {}
  try { const { data } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle(); ctx.conn = data || null; } catch {}
  return ctx;
}

async function googleToken(ctx) {
  if (ctx._token !== undefined) return ctx._token;
  if (!ctx.conn) return (ctx._token = null);
  const { getValidAccessToken } = await import("@/lib/google");
  try { ctx._token = await getValidAccessToken(ctx.supabase, ctx.conn); } catch { ctx._token = null; }
  return ctx._token;
}
const needGoogle = (ctx) => (!ctx.conn ? skip("Google is not connected.", "Connect Google on the Connections page, then run this again.") : null);
const needHost = (ctx) => (!ctx.host ? skip("No scan yet.", "Scan your website first.") : null);
function niche(ctx) {
  const seg = ctx.ai?.brief?.segments?.[0];
  return String(seg || ctx.ai?.targetCustomer || ctx.ai?.industry || "furniture retailers").split(/[;,]/)[0].trim().slice(0, 60);
}

// ── The checks ──────────────────────────────────────────────────────────────
export const CHECKS = [
  // SETUP
  {
    id: "env", group: "Setup", label: "Server settings",
    run: async (ctx, { origin }) => {
      const missing = [];
      for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "APP_URL", "GOOGLE_CONNECT_CLIENT_ID", "GOOGLE_CONNECT_CLIENT_SECRET", "GOOGLE_CONNECT_REDIRECT_URI"]) if (!has(k)) missing.push(k);
      if (!has("GEMINI_API_KEY") && !has("GROQ_API_KEY") && !has("OPENROUTER_API_KEY")) missing.push("an AI key (GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY)");
      if (missing.length) return fail(`Missing: ${missing.join(", ")}`, "Add these in Vercel → Settings → Environment Variables, then redeploy.");
      const appUrl = String(process.env.APP_URL).replace(/\/+$/, "");
      if (origin && appUrl !== origin) return warn(`APP_URL is ${appUrl} but this site is ${origin}.`, "The nightly engine calls APP_URL. Set it to this site's address, or nightly jobs call the wrong place.");
      const redirect = String(process.env.GOOGLE_CONNECT_REDIRECT_URI);
      if (origin && !redirect.startsWith(origin)) return warn(`Google redirect is ${redirect}, not on ${origin}.`, "Google sends people back to this address after connecting. It must be on this site.");
      return pass("All required settings are present and point at this site.");
    },
  },
  {
    id: "database", group: "Setup", label: "Database tables and columns",
    run: async (ctx) => {
      const { SCHEMA_MANIFEST } = await import("@/lib/schema-manifest");
      const extra = { scans: ["page_text"], connections: ["token_expires_at", "updated_at", "scopes", "google_email"] };
      const missing = [];
      for (const [t, base] of Object.entries(SCHEMA_MANIFEST)) {
        const cols = [...new Set([...(base || []), ...(extra[t] || [])])];
        const { error } = await ctx.supabase.from(t).select(cols.length ? cols.join(",") : "*").limit(0);
        if (!error) continue;
        const { error: tErr } = await ctx.supabase.from(t).select("*").limit(0);
        if (tErr) { missing.push(`table ${t}`); continue; }
        for (const c of cols) { const { error: e } = await ctx.supabase.from(t).select(c).limit(0); if (e) missing.push(`${t}.${c}`); }
      }
      return missing.length
        ? fail(`${missing.length} missing: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`, "Open /diagnostics for the full list and the SQL to run.", missing)
        : pass(`All ${Object.keys(SCHEMA_MANIFEST).length} tables and their columns are present.`);
    },
  },
  {
    id: "nightly", group: "Setup", label: "Nightly engine can reach itself",
    run: async (ctx) => {
      if (!has("CRON_SECRET") || !has("APP_URL")) return fail("CRON_SECRET or APP_URL is missing.", "Both are needed for the nightly run.");
      const base = String(process.env.APP_URL).replace(/\/+$/, "");
      // A cheap internal call carrying the cron header. 401 means the secret does not
      // match; a network error means APP_URL is wrong. Either stops every night's work.
      const r = await fetch(`${base}/api/keywords/sync`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-genie-cron": process.env.CRON_SECRET },
        body: JSON.stringify({ host: ctx.host || "selftest.invalid", _uid: ctx.userId }), signal: AbortSignal.timeout(60000),
      }).catch((e) => ({ ok: false, status: 0, _err: String(e?.message || e) }));
      if (r.status === 401) return fail("The nightly engine is refused by its own app (401).", "CRON_SECRET must be the same value everywhere it is set. Redeploy after changing it.");
      if (!r.ok) return fail(`Could not reach ${base} (${r.status || r._err}).`, "Set APP_URL to this site's exact address in Vercel, then redeploy.");
      return pass("Internal calls authenticate and reach the app. Nightly jobs can run.");
    },
  },

  // AI
  ...["gemini", "groq", "openrouter"].map((p) => ({
    id: `ai-${p}`, group: "AI", label: `AI provider: ${p === "gemini" ? "Google Gemini" : p === "groq" ? "Groq" : "OpenRouter"}`,
    run: async () => {
      const key = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY" }[p];
      if (!has(key)) return skip(`${key} is not set.`, "Optional, but each provider is a backup for the others.");
      const router = await import("@/lib/ai-router");
      try {
        const r = await router.callAI({ only: [p], json: true, maxTokens: 60, temperature: 0, prompt: 'Return exactly this JSON: {"ok":true}', timeoutMs: 30000 });
        // Gemini may have switched to another model because the configured one is
        // retired or out of quota; say which one actually answered.
        const used = p === "gemini" && router.lastGeminiModel && router.lastGeminiModel !== r.model ? `${router.lastGeminiModel}, switched from ${r.model}` : r.model;
        return r.json?.ok ? pass(`Answered in ${r.latencyMs}ms (${used}).`) : warn(`Answered, but not with the JSON asked for.`, null, r.text?.slice(0, 200));
      } catch (e) {
        const a = (e?.attempts || []).map((x) => x.error || x.skipped).filter(Boolean).join("; ");
        const cooling = /cooling_down|soft_rate_limit|over_daily_budget/.test(a);
        const quota = /exceeded your current quota|RESOURCE_EXHAUSTED/i.test(a);
        if (p === "gemini" && quota) return warn("Every Gemini model this key can use is out of free quota for today.", "Nothing to fix: Genie uses Groq, OpenRouter and then your OpenRouter credit instead. Gemini's free quota resets daily.");
        return (cooling ? warn : fail)(`Failed: ${a || e?.message}`.slice(0, 300), cooling ? "Rate limited right now. Run again in a minute." : "Check the key in Vercel, and that the model name in its *_MODEL setting still exists.");
      }
    },
  })),
  {
    id: "ai-paid", group: "AI", label: "Paid backup (OpenRouter credit) and daily spend cap",
    run: async () => {
      if (!has("OPENROUTER_API_KEY")) return skip("OPENROUTER_API_KEY is not set, so there is no paid backup.", null);
      if (/^(1|true|yes)$/i.test(process.env.OPENROUTER_PAID_DISABLED || "")) return skip("Turned off with OPENROUTER_PAID_DISABLED.", null);
      const { callAI } = await import("@/lib/ai-router");
      const cap = Number.isFinite(parseFloat(process.env.PAID_DAILY_USD)) ? parseFloat(process.env.PAID_DAILY_USD) : 0.3;
      try {
        // One tiny call, a small fraction of a cent, to prove the credit works.
        const r = await callAI({ only: ["openrouter-paid"], json: true, maxTokens: 30, temperature: 0, prompt: 'Return exactly this JSON: {"ok":true}', timeoutMs: 30000 });
        const cost = r.usage?.costUsd ?? 0;
        return pass(`Works (${r.model}); this check cost $${cost.toFixed(6)}. Used only after every free AI fails, and stops for the day at $${cap.toFixed(2)} (change with PAID_DAILY_USD).`);
      } catch (e) {
        const a = (e?.attempts || []).map((x) => x.error || x.skipped).join("; ");
        if (/over_spend_cap/.test(a)) return warn(`Today's paid AI spend has reached the $${cap.toFixed(2)} cap, so the backup is resting until tomorrow.`, "Raise PAID_DAILY_USD in Vercel if you want more per day.");
        return fail(`Failed: ${a || e?.message}`.slice(0, 300), /402|credit|insufficient/i.test(a) ? "Your OpenRouter credit is used up. Add credit at openrouter.ai/credits." : /404|not a valid model|no endpoints/i.test(a) ? "The paid model is not available. Set OPENROUTER_PAID_MODEL to a current model from openrouter.ai/models." : "Check OPENROUTER_API_KEY in Vercel.");
      }
    },
  },
  {
    id: "ai-long", group: "AI", label: "AI can write a long answer without cutting off",
    run: async () => {
      const { callAI } = await import("@/lib/ai-router");
      try {
        const r = await callAI({
          json: true, temperature: 0.3, maxTokens: 3000, timeoutMs: 50000,
          prompt: 'List 30 different search phrases a furniture shop owner might type. For each give a one-sentence reason. Return ONLY JSON: {"items":[{"phrase":"","why":""}]}',
        });
        const n = Array.isArray(r.json?.items) ? r.json.items.length : 0;
        return n >= 25 ? pass(`Got ${n} complete items from ${r.provider} in ${Math.round(r.latencyMs / 1000)}s.`) : warn(`Only ${n} items came back (${r.provider}).`, "Long answers are being cut short. Send this report to your developer.");
      } catch (e) {
        return fail("Every provider failed on a long answer.", "This is what makes keyword building and onboarding fail. Send this report to your developer.", (e?.attempts || []).map((x) => `${x.provider}: ${x.error || x.skipped}`));
      }
    },
  },

  // YOUR BUSINESS
  {
    id: "scan", group: "Your business", label: "Saved scan and what Genie knows",
    run: async (ctx) => {
      const s = needHost(ctx); if (s) return s;
      const { coverage } = await import("@/lib/business-brief");
      const text = String(ctx.scan?.page_text || "");
      const cov = coverage(ctx.ai?.brief, ctx.ai);
      const bits = [`${ctx.host}`, `${text.length.toLocaleString()} characters of site text`, `${cov.score}% understood`];
      if (text.length < 1500) return warn(bits.join(" · "), "Rescan your website. Scans from before the latest update kept too little of your page, so Genie cannot quote your prices back to you.");
      if (!ctx.ai?.brief || !cov.ready) return warn(bits.join(" · "), "Finish onboarding: paste your strategy in the chat, then press Build my plan.");
      return pass(bits.join(" · "));
    },
  },
  {
    id: "scan-live", group: "Your business", label: "Scanner reads your site right now",
    run: async (ctx) => {
      const s = needHost(ctx); if (s) return s;
      const { runAudit } = await import("@/lib/audit");
      const t = Date.now();
      const a = await runAudit(ctx.host);
      if (!a.ok) return fail(`Could not read ${ctx.host}: ${a.reason}${a.status ? ` (HTTP ${a.status})` : ""}.`, "Check the site opens for visitors. Some firewalls block servers; allow the MarketingGenieBot user agent.");
      const prices = (a.pageText.match(/[$£€]\s?\d[\d,.]*/g) || []).slice(0, 4);
      return pass(`Scored ${a.scores?.overall}/100, read ${a.pageText.length.toLocaleString()} characters in ${Math.round((Date.now() - t) / 1000)}s${prices.length ? `, saw prices ${prices.join(", ")}` : ""}.`);
    },
  },
  {
    id: "profile", group: "Your business", label: "Company and sender details",
    run: async (ctx) => {
      const p = ctx.profile;
      const missing = [["company name", p.company_name], ["sender name", p.sender_name], ["sender email", p.sender_email], ["page buyers are sent to", p.money_page_url]].filter(([, v]) => !v).map(([k]) => k);
      if (!missing.length) return pass(`${p.company_name}, sending as ${p.sender_name}.`);
      return warn(`Not set: ${missing.join(", ")}.`, "Fill these in Settings. They go in every outreach email's signature and every call to action.");
    },
  },
  {
    id: "keywords", group: "Your business", label: "Keyword strategy",
    run: async (ctx) => {
      const s = needHost(ctx); if (s) return s;
      const { count } = await ctx.supabase.from("keywords").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).eq("host", ctx.host);
      if (count > 0) return pass(`${count} keywords tracked for ${ctx.host}.`);
      return fail("No keywords. Buyer Hunt, content and outreach all run on them.", "Go to Growth → Rebuild strategy, then run this check again. If it fails, the AI checks above say why.");
    },
  },

  // GOOGLE
  {
    id: "google-conn", group: "Google", label: "Google connection and permissions",
    run: async (ctx) => {
      const s = needGoogle(ctx); if (s) return s;
      const { connScopes, connEmail } = await import("@/lib/gmail");
      const granted = connScopes(ctx.conn);
      const need = { "gmail.send": "send outreach", "gmail.readonly": "see replies", webmasters: "Search Console", analytics: "Google Analytics", adwords: "search volumes", indexing: "fast indexing" };
      const lacking = Object.entries(need).filter(([k]) => !granted.includes(k)).map(([, v]) => v);
      const who = connEmail(ctx.conn) || "unknown account";
      if (!ctx.conn.refresh_token) return fail(`Connected as ${who}, but with no refresh token, so it stops working within an hour.`, "Disconnect and connect Google again.");
      return lacking.length
        ? warn(`Connected as ${who}, missing permission for: ${lacking.join(", ")}.`, "Reconnect Google and tick every box on Google's permission screen.")
        : pass(`Connected as ${who} with every permission.`);
    },
  },
  {
    id: "google-token", group: "Google", label: "Google access token refreshes",
    run: async (ctx) => {
      const s = needGoogle(ctx); if (s) return s;
      const t = await googleToken(ctx);
      return t ? pass("Got a working access token.") : fail("Google refused to renew access.", "If the Google app is still in Testing, access expires after 7 days: publish it to Production, then reconnect Google.");
    },
  },
  {
    id: "gmail-read", group: "Google", label: "Gmail: read replies",
    run: async (ctx) => {
      const s = needGoogle(ctx); if (s) return s;
      const t = await googleToken(ctx); if (!t) return skip("No access token.", "Fix the check above first.");
      const r = await gget("https://gmail.googleapis.com/gmail/v1/users/me/profile", t);
      if (!r.ok) { const m = await googleError(r); return fail(m, enableHint(m, "Gmail API") || "Reconnect Google and allow reading email."); }
      const j = await r.json();
      return pass(`Reads ${j.emailAddress} (${Number(j.messagesTotal || 0).toLocaleString()} messages). Genie only looks for replies from people it emailed.`);
    },
  },
  {
    id: "gmail-send", group: "Google", label: "Gmail: send outreach",
    run: async (ctx, { sendTestEmail }) => {
      const s = needGoogle(ctx); if (s) return s;
      const { connScopes, connEmail, sendViaGmail } = await import("@/lib/gmail");
      if (!connScopes(ctx.conn).includes("gmail.send")) return fail("No permission to send email.", "Reconnect Google and tick the box to send email.");
      if (!sendTestEmail) return skip("Permission is granted. Tick \"Send a test email to myself\" to prove a real send.", null);
      const me = connEmail(ctx.conn);
      if (!me) return fail("Could not tell which Gmail address is connected.", "Reconnect Google.");
      const r = await sendViaGmail(ctx.supabase, ctx.conn, { fromName: ctx.profile.sender_name || "Marketing Genie", fromEmail: me, to: me, subject: "Marketing Genie self-test", html: "<p>This is Genie's self-test. If you can read this, outreach can send from your Gmail.</p>" });
      if (!r.ok) return fail(`Send failed: ${r.error}`, enableHint(String(r.error), "Gmail API") || "Reconnect Google and allow sending email.");
      return pass(`Sent a test email to ${me}. Check your inbox.`);
    },
  },
  {
    id: "gsc", group: "Google", label: "Search Console data",
    run: async (ctx) => {
      const s = needGoogle(ctx) || needHost(ctx); if (s) return s;
      const t = await googleToken(ctx); if (!t) return skip("No access token.", "Fix the token check first.");
      const r = await gget("https://www.googleapis.com/webmasters/v3/sites", t);
      if (!r.ok) { const m = await googleError(r); return fail(m, enableHint(m, "Google Search Console API") || "Reconnect Google and allow Search Console."); }
      const { resolveGscProperty } = await import("@/lib/gsc");
      const site = await resolveGscProperty(t, ctx.host);
      const listed = ((await r.json()).siteEntry || []).map((x) => x.siteUrl);
      if (!site) return warn(`No Search Console property for ${ctx.host}. This account has: ${listed.join(", ") || "none"}.`, `Add ${ctx.host} in Search Console (a Domain property is best) with this same Google account, verify it, then run again.`);
      const q = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
        method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10), endDate: new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10) }),
        signal: AbortSignal.timeout(20000),
      });
      if (!q.ok) return fail(await googleError(q), "Search Console refused the query.");
      const row = (await q.json()).rows?.[0];
      return pass(`${site}: ${row ? `${Math.round(row.clicks)} clicks, ${Math.round(row.impressions).toLocaleString()} impressions in the last 28 days` : "connected, no search data yet (normal for a new site)"}.`);
    },
  },
  {
    id: "gsc-inspect", group: "Google", label: "Search Console: is your homepage on Google",
    run: async (ctx) => {
      const s = needGoogle(ctx) || needHost(ctx); if (s) return s;
      const t = await googleToken(ctx); if (!t) return skip("No access token.", "Fix the token check first.");
      const { resolveGscProperty } = await import("@/lib/gsc");
      const site = await resolveGscProperty(t, ctx.host);
      if (!site) return skip("No Search Console property for this site.", "See the check above.");
      const url = ctx.scan?.final_url || `https://${ctx.host}/`;
      const r = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
        method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: site }), signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) { const m = await googleError(r); return fail(m, enableHint(m, "Google Search Console API") || "Search Console refused the inspection."); }
      const { explainInspection } = await import("@/lib/search-health");
      const v = explainInspection(url, await r.json());
      return v.status === "indexed" ? pass(`${url} is on Google.`) : warn(`${url}: ${v.status.replace(/_/g, " ")}.`, v.advice);
    },
  },
  {
    id: "ga4", group: "Google", label: "Google Analytics (both APIs)",
    run: async (ctx) => {
      const s = needGoogle(ctx); if (s) return s;
      const t = await googleToken(ctx); if (!t) return skip("No access token.", "Fix the token check first.");
      const a = await gget("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", t);
      if (!a.ok) { const m = await googleError(a); return fail(`Admin API: ${m}`, enableHint(m, "Google Analytics Admin API") || "Reconnect Google and allow Analytics."); }
      const props = [];
      for (const acc of (await a.json()).accountSummaries || []) for (const p of acc.propertySummaries || []) props.push(p);
      if (!props.length) return warn("Connected, but this Google account has no Analytics properties.", "Optional. Add GA4 to your site with this account to see traffic here.");
      const d = await fetch(`https://analyticsdata.googleapis.com/v1beta/${props[0].property}:runReport`, {
        method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dateRanges: [{ startDate: "28daysAgo", endDate: "today" }], metrics: [{ name: "sessions" }] }), signal: AbortSignal.timeout(20000),
      });
      if (!d.ok) { const m = await googleError(d); return fail(`Data API: ${m}`, enableHint(m, "Google Analytics Data API") || "Analytics refused the report."); }
      const sessions = (await d.json()).rows?.[0]?.metricValues?.[0]?.value || 0;
      return pass(`${props.length} propert${props.length > 1 ? "ies" : "y"}; "${props[0].displayName}" had ${Number(sessions).toLocaleString()} sessions in 28 days.`);
    },
  },
  {
    id: "google-ads", group: "Google", label: "Google Ads: real search volumes",
    run: async (ctx) => {
      if (!has("GOOGLE_ADS_DEVELOPER_TOKEN")) return skip("GOOGLE_ADS_DEVELOPER_TOKEN is not set, so volumes are AI estimates.", "Optional. Needs a Google Ads account and an approved developer token.");
      const s = needGoogle(ctx); if (s) return s;
      const t = await googleToken(ctx); if (!t) return skip("No access token.", "Fix the token check first.");
      const { probeAdsVersion, adsKeywordIdeas } = await import("@/lib/google-ads");
      const probe = await probeAdsVersion(t);
      if (!probe.ok) return fail(probe.error, enableHint(probe.error, "Google Ads API") || (/DEVELOPER_TOKEN|not approved/i.test(probe.error) ? "Your developer token is not approved for real accounts yet. Apply for Basic access in the Google Ads API Center." : "Check the developer token and that this Google account can open a Google Ads account."));
      const ideas = await adsKeywordIdeas(t, probe.customerId, ["sofa"], probe.version);
      if (!ideas.ok) return fail(ideas.error, /DEVELOPER_TOKEN|not approved|test account/i.test(ideas.error) ? "The developer token only works on test accounts. Apply for Basic access in the Google Ads API Center." : null);
      return pass(`API ${probe.version} works: "sofa" gets ${ideas.volume.toLocaleString()} searches a month.`);
    },
  },

  // FINDING CUSTOMERS
  {
    id: "web-search", group: "Finding customers", label: "Web search",
    run: async (ctx) => {
      const { webSearch, groundedSearchLastError, tavilyLastError } = await import("@/lib/search");
      // A different query each run: results are cached for hours, and a cached hit
      // would prove nothing about whether search works right now.
      const words = ["guide", "shops", "brands", "stores", "near me", "reviews", "ideas", "online", "list", "directory", "top rated", "compared"];
      const q = `best ${niche(ctx)} ${words[Math.floor(Date.now() / 60000) % words.length]}`;
      const r = await webSearch(q, { limit: 5 });
      const why = groundedSearchLastError();
      if (r.length) {
        if (r.some((x) => /vertexaisearch\.cloud\.google\.com/.test(x.url))) return warn(`Results came back as Google redirect links, not real addresses.`, "Send this report to your developer.");
        if (!why) return pass(`Google search via Gemini: "${q}" returned ${r.length} results, e.g. ${r[0].url}`);
        return warn(`Gemini search was unavailable, a backup answered: ${r.length} results, e.g. ${r[0].url}`, `Gemini said: ${why}. Search still works through the backup.`);
      }
      const tav = tavilyLastError();
      const hasTavily = has("TAVILY_API_KEY");
      return fail(`"${q}" returned nothing. Gemini: ${why || "no error recorded"}.${hasTavily ? ` Tavily: ${tav || "no results"}.` : ""}`,
        !hasTavily
          ? "Add a free backup: sign up at tavily.com (no card, 1,000 searches a month), copy the API key, add it in Vercel as TAVILY_API_KEY, and redeploy. Gemini's free search allowance resets daily."
          : /401|403/.test(tav || "") ? "The Tavily key was refused. Copy it again from app.tavily.com into TAVILY_API_KEY in Vercel and redeploy."
          : "Both search sources are out of allowance for now. Gemini resets daily, Tavily monthly.");
    },
  },
  {
    id: "reddit", group: "Finding customers", label: "Reddit search",
    run: async (ctx) => {
      const { redditSearch, testRedditAuth } = await import("@/lib/search");
      const via = (await testRedditAuth())?.via;
      const r = await redditSearch(niche(ctx), { limit: 5 });
      return r.length ? pass(`${r.length} threads via ${via}.`) : warn(`No threads for "${niche(ctx)}" via ${via}.`, via === "google" ? "Optional: add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET for Reddit's own search." : null);
    },
  },
  {
    id: "communities", group: "Finding customers", label: "Q&A communities (Stack Exchange, Hacker News)",
    run: async (ctx) => {
      const { stackExchangeSearch, hnSearch } = await import("@/lib/intent-sources");
      const [se, hn] = await Promise.all([stackExchangeSearch(niche(ctx), { limit: 3 }).catch(() => []), hnSearch(niche(ctx), { limit: 3 }).catch(() => [])]);
      return se.length || hn.length ? pass(`Stack Exchange ${se.length}, Hacker News ${hn.length}.`) : warn("Both returned nothing for your niche.", "Normal for many non-tech niches; Reddit and Quora carry the hunt there.");
    },
  },
  {
    id: "autocomplete", group: "Finding customers", label: "Real Google searches (Autocomplete)",
    run: async (ctx) => {
      const { autocompleteSuggestions } = await import("@/lib/autocomplete");
      const r = await autocompleteSuggestions(niche(ctx));
      return r.length ? pass(`${r.length} real searches, e.g. "${r[0]}".`) : warn("Google Autocomplete returned nothing from this server.", "Keywords still build from AI, just not grounded in real searches. Often temporary rate limiting.");
    },
  },
  {
    id: "prospects", group: "Finding customers", label: "Find clients: companies and contacts",
    run: async (ctx) => {
      const { findCompanies, profileCompany, fitFrom } = await import("@/lib/prospects");
      const n = niche(ctx);
      const companies = await findCompanies(n, { limit: 3, fit: fitFrom(ctx.ai) });
      if (!companies.length) return fail(`Found no companies for "${n}".`, "Check the web search and AI checks above.");
      const p = await profileCompany(companies[0].url).catch(() => null);
      const emails = p?.emails?.length || 0;
      return (emails ? pass : warn)(`"${n}": ${companies.map((c) => c.domain).join(", ")}. ${companies[0].domain}: ${emails} published email${emails === 1 ? "" : "s"}${p?.contactForm ? ", has a contact form" : ""}.`, emails ? undefined : "The first company publishes no email; Genie falls back to its contact form. Normal for some.");
    },
  },
  {
    id: "featured", group: "Finding customers", label: "Get featured: finding sites",
    run: async (ctx) => {
      const { findMediaSitesDetailed } = await import("@/lib/earned-media");
      const n = niche(ctx);
      const { sites, diag } = await findMediaSitesDetailed("backlinks", n, { limit: 4 });
      return sites.length ? pass(`${sites.length} sites for "${n}": ${sites.map((s) => s.domain).join(", ")}.`) : fail(`No sites for "${n}" (search ${diag.search}, AI ${diag.ai}${diag.err ? `, ${diag.err}` : ""}).`, "Check the web search and AI checks above.");
    },
  },
  {
    id: "authority", group: "Finding customers", label: "Site authority scores (OpenPageRank)",
    run: async () => {
      if (!has("OPENPAGERANK_API_KEY")) return skip("OPENPAGERANK_API_KEY is not set.", "Optional. Without it, sites are not ranked by authority.");
      const { scoreDomains, authorityLastError } = await import("@/lib/authority");
      const m = await scoreDomains(["wikipedia.org"]);
      const v = m.get("wikipedia.org");
      if (v?.score) return pass(`wikipedia.org scores ${v.score}/10. Giants above 6 are filtered out of Find clients.`);
      const why = authorityLastError();
      // Clues about the saved key without revealing it: its prefix, length, and
      // whether it carries spaces or quotes that were pasted in with it.
      const raw = String(process.env.OPENPAGERANK_API_KEY || "");
      const clean = raw.trim().replace(/^["']|["']$/g, "");
      const clues = [
        clean.startsWith("opr_live_") ? "starts with opr_live_ (new format)" : clean.startsWith("opr_") ? `starts with ${clean.slice(0, 8)}… (not a live key)` : "does NOT start with opr_live_ (old DomCop format, or a different value)",
        `${clean.length} characters`,
        raw !== clean ? "had spaces or quotes around it (now ignored)" : null,
      ].filter(Boolean).join(", ");
      return fail(why ? `OpenPageRank refused: ${why}. The saved key ${clues}.` : `The key is set but no score came back. The saved key ${clues}.`, /401/.test(why || "")
        ? "Sign in at openpagerank.keywordseverywhere.com, copy the API key shown in your dashboard (it starts with opr_live_), paste it into Vercel → Settings → Environment Variables → OPENPAGERANK_API_KEY with nothing before or after it, save, then Redeploy. Old DomCop keys stop working 30 September 2026."
        : "Check the key and its monthly quota at openpagerank.keywordseverywhere.com.");
    },
  },

  // OUTREACH AND WEBSITE
  {
    id: "email-dns", group: "Outreach and website", label: "Email checks work on this server",
    run: async () => {
      const { verifyEmail } = await import("@/lib/email-verify");
      const good = await verifyEmail("someone@gmail.com");
      const bad = await verifyEmail("someone@this-domain-does-not-exist-9f3k2.com");
      if (good.ok && !bad.ok) return pass("Real domains pass, dead domains are caught before sending.");
      if (good.ok) return warn("Dead domains were not caught (DNS lookups may be failing open).", "Outreach still sends; bounces are just not prevented.");
      return fail("A real Gmail address was rejected.", "Email verification is blocking good addresses. Send this report to your developer.");
    },
  },
  {
    id: "deliverability", group: "Outreach and website", label: "Your sending address",
    run: async (ctx) => {
      const { connEmail } = await import("@/lib/gmail");
      const addr = connEmail(ctx.conn) || ctx.profile.sender_email;
      if (!addr) return skip("No sending address yet.", "Connect Google, or add a sender email in Settings.");
      const { checkDeliverability } = await import("@/lib/deliverability");
      const d = await checkDeliverability(addr);
      if (!d?.ok) return warn(`Could not check ${addr}.`, null);
      const bad = (d.checks || []).filter((c) => c.status !== "pass");
      return (d.score >= 80 ? pass : warn)(`${addr}: ${d.grade} (${d.score}/100).`, bad.map((c) => c.note).filter(Boolean).join(" ") || undefined);
    },
  },
  {
    id: "embed", group: "Outreach and website", label: "Website snippet",
    run: async (ctx, { origin }) => {
      const { makeIngestToken } = await import("@/lib/commerce");
      let r, js = "";
      try {
        r = await fetch(`${origin}/api/embed?k=${makeIngestToken(ctx.userId)}`, { signal: AbortSignal.timeout(15000) });
        js = r.ok ? await r.text() : "";
      } catch (e) {
        return fail(`Could not load the snippet: ${String(e?.message || e)}.`, "Send this report to your developer.");
      }
      if (!r.ok || js.length < 300 || /^\s*\/\*/.test(js) && js.length < 400) return fail(`The snippet did not load (HTTP ${r.status}, ${js.length} bytes).`, "Send this report to your developer.");
      return pass(`Snippet serves ${Math.round(js.length / 1024)}KB of script. Paste it on your site to count visitors and catch leads.`);
    },
  },
];

export const CHECK_INDEX = Object.fromEntries(CHECKS.map((c) => [c.id, c]));
