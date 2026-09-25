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
  try {
    const { data } = await supabase.from("connections").select("*").eq("user_id", userId);
    for (const row of data || []) {
      if (row.provider === "google") ctx.conn = row;
      if (row.provider === "x") ctx.xConn = row;
      if (row.provider === "wordpress") ctx.wpConn = row;
    }
  } catch {}
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

const AI_NAMES = { gemini: "Google Gemini", groq: "Groq", openrouter: "OpenRouter", mistral: "Mistral", cloudflare: "Cloudflare Workers AI", cerebras: "Cerebras" };

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
  // Every free provider, including the extra ones the swarm uses (lib/ai-router).
  ...["gemini", "groq", "openrouter", "mistral", "cloudflare", "cerebras"].map((p) => ({
    id: `ai-${p}`, group: "AI", label: `AI provider: ${AI_NAMES[p]}`,
    run: async () => {
      const key = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY", mistral: "MISTRAL_API_KEY", cloudflare: "CLOUDFLARE_AI_TOKEN", cerebras: "CEREBRAS_API_KEY" }[p];
      if (!has(key)) return skip(`${key} is not set.`, "Optional, but each provider is a backup for the others.");
      if (p === "cloudflare" && !has("CLOUDFLARE_ACCOUNT_ID")) return fail("CLOUDFLARE_AI_TOKEN is set but CLOUDFLARE_ACCOUNT_ID is not.", "Add CLOUDFLARE_ACCOUNT_ID in Vercel (Cloudflare → Workers & Pages, right side), then redeploy.");
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
        const overloaded = /high demand|UNAVAILABLE|"code": ?503|overloaded/i.test(a);
        if (p === "gemini" && (quota || overloaded)) {
          return warn(overloaded ? "Google's Gemini servers are overloaded right now (their error, not Genie's)." : "Every Gemini model this key can use is out of free quota for today.", "Nothing to fix: Genie automatically uses Groq, OpenRouter and then your OpenRouter credit instead. Gemini recovers on its own.");
        }
        if (p === "mistral" && /429|rate.?limit/i.test(a)) {
          return warn("Mistral accepted the key but is limiting requests right now (429).", "The key is fine: Mistral's free plan throttles requests, per model (see admin.mistral.ai → Limits). Run this again in a few minutes. Genie keeps using the other free services meanwhile.");
        }
        const noPlan = p === "mistral" && /40[13]|unauthori[sz]ed|no active plan|subscription|payment|billing/i.test(a);
        if (noPlan) return fail(`Mistral refused the key: ${a}`.slice(0, 300), "In console.mistral.ai → Admin/Billing (Workspace settings), choose the free plan (it may be called Free or Experiment, and asks to verify a phone number). No card needed. Then run this again.");
        // A timeout is a slow queue, not a bad key — and telling someone to check a
        // key that demonstrably works (the paid OpenRouter check uses the very same
        // one) sends them to change a setting that was never the problem.
        const timedOut = /did not respond within|timeout|aborted|ETIMEDOUT/i.test(a || String(e?.message || ""));
        if (timedOut) {
          return warn(
            `${AI_NAMES[p] || p} did not answer in time. ${a || e?.message}`.slice(0, 300),
            p === "openrouter"
              ? "Nothing to change. OpenRouter's FREE models queue behind everyone else's requests and often take longer than Genie waits. Your key is fine — the paid OpenRouter check above uses the same one. Genie writes with the providers that did answer."
              : "Usually the provider being busy rather than anything on your side. Genie uses the others meanwhile; run this again later."
          );
        }
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

  // ── THE PLAN, AND EVERY ENGINE THAT WORKS FROM IT ──
  // Eight engines were built without a row in this file, which is the exact gap it
  // exists to close: a unit test can prove a function is right, only this can prove
  // it is reached, with the owner's real plan and the owner's real data.
  {
    id: "plan", group: "The plan", label: "One plan every engine reads",
    run: async (ctx) => {
      const s = needHost(ctx); if (s) return s;
      const { storedStrategy } = await import("@/lib/strategy-store");
      const { normalizeStrategy, strategyReady } = await import("@/lib/strategy");
      const raw = await storedStrategy(ctx.supabase, ctx.userId);
      if (!raw) return fail("No plan is stored. Every engine falls back to guessing from your scan.", "Open The plan and press Rebuild, then run this check again.");
      const p = normalizeStrategy(raw);
      if (!strategyReady(p)) return fail("A plan exists but is not complete enough to use.", "Open The plan, fill in who you sell to and what you sell, then save.");
      const missing = [];
      if (!p.offer) missing.push("your price");
      if (!p.partnerOffer) missing.push("your partner offer (what an agency who resells you earns)");
      const where = p.markets?.length ? ` in ${p.markets.slice(0, 3).map((m) => m.name || m.code || m).join(", ")}` : "";
      const who = `Targeting ${p.who || "—"}${where}`;
      return missing.length
        ? warn(`${who}. Not filled in: ${missing.join("; ")}.`, "Open The plan and add them. Without a price Genie will not quote one, and without partner terms it will not pitch agencies a number.")
        : pass(`${who}. Price and partner offer are both set.`);
    },
  },
  {
    id: "brain", group: "The plan", label: "Engines are reading the plan, not guessing",
    run: async (ctx) => {
      const s = needHost(ctx); if (s) return s;
      const { genieBrain } = await import("@/lib/brain");
      const b = await genieBrain(ctx.supabase, { userId: ctx.userId, host: ctx.host, ai: ctx.ai });
      // An empty block is not a bug on a new account: with no plan AND no answers
      // from the interview there is genuinely nothing to tell an engine. Saying
      // "call your developer" here would be crying wolf at every new owner.
      if (!b.block) {
        return fail("Engines have no business context at all — no plan, and nothing from the interview either. Every draft is written from the website alone.",
          "Open The plan and press Rebuild. If that leaves it empty, answer Genie's questions about the business first.");
      }
      if (!b.ready) return warn(`Falling back to your scan (${b.block.length} characters). Engines still write, just from the scan instead of the plan.`, "The plan check above says what to fix.");
      const partner = await genieBrain(ctx.supabase, { userId: ctx.userId, host: ctx.host, ai: ctx.ai, audience: "partner" });
      const threaded = /PARTNER, NOT A CUSTOMER|partner terms/i.test(partner.block);
      return threaded
        ? pass(`The plan reaches engines (${b.block.length} characters), and writing to an agency pitches them differently from a buyer.`)
        : warn(`The plan reaches engines (${b.block.length} characters), but an agency pitch reads the same as a buyer pitch.`, "Add your partner offer on The plan.");
    },
  },
  {
    id: "platform", group: "The plan", label: "What a shop is built on",
    run: async (ctx) => {
      const s = needHost(ctx); if (s) return s;
      const { detectPlatform } = await import("@/lib/platform-detect");
      let html = "";
      try {
        const r = await fetch(`https://${ctx.host}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketingGenie/1.0)" }, signal: AbortSignal.timeout(15000) });
        html = r.ok ? (await r.text()).slice(0, 200000) : "";
      } catch (e) {
        return warn(`Could not read ${ctx.host} from this server (${String(e?.message || e).slice(0, 80)}).`, "Detection still runs on prospects' sites; this check just could not reach your own.");
      }
      if (!html) return warn(`${ctx.host} did not return a page to this server.`, "Detection still runs on prospects' sites.");
      const found = detectPlatform(html);
      return found
        ? pass(`Detection works: ${ctx.host} runs ${found}. Prospects are checked the same way before Genie writes to them.`)
        : warn(`No platform detected on ${ctx.host} (custom or unrecognised build).`, "An unknown platform is never treated as a no — a prospect Genie cannot read is still contacted.");
    },
  },

  // GOOGLE
  {
    id: "google-conn", group: "Google", label: "Google connection and permissions",
    run: async (ctx) => {
      const s = needGoogle(ctx); if (s) return s;
      const { connScopes, connEmail } = await import("@/lib/gmail");
      const granted = connScopes(ctx.conn);
      const need = { "gmail.send": "send outreach", "gmail.readonly": "see replies", webmasters: "Search Console", siteverification: "set Search Console up for you", analytics: "Google Analytics", adwords: "search volumes", indexing: "fast indexing" };
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
      if (!site) return warn(`No Search Console property for ${ctx.host} yet. This account has: ${listed.join(", ") || "none"}.`, "Genie can do this for you: Connections page → \"Real Google rankings\" → Set it up for me. It verifies your site with Google and adds the property; you never open Search Console.");
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
      // Optional by design: without it Genie estimates volumes instead of reading
      // them. A missing Ads account is not a broken Genie, so it is not a failure.
      if (!probe.ok && /not associated with any Ads accounts|no Google Ads account/i.test(probe.error)) {
        return warn("This Google account has no Google Ads account, so search volumes are Genie's estimates.", "Optional. Create a free Google Ads account with this same Google login if you want Google's real monthly search numbers. Nothing else changes.");
      }
      if (!probe.ok) return fail(probe.error, enableHint(probe.error, "Google Ads API") || (/DEVELOPER_TOKEN|not approved/i.test(probe.error) ? "Your developer token is not approved for real accounts yet. Apply for Basic access in the Google Ads API Center." : "Check the developer token and that this Google account can open a Google Ads account."));
      const ideas = await adsKeywordIdeas(t, probe.customerId, ["sofa"], probe.version);
      if (!ideas.ok) return fail(ideas.error, /DEVELOPER_TOKEN|not approved|test account/i.test(ideas.error) ? "The developer token only works on test accounts. Apply for Basic access in the Google Ads API Center." : null);
      return pass(`API ${probe.version} works: "sofa" gets ${ideas.volume.toLocaleString()} searches a month.`);
    },
  },

  // CONNECTIONS — what can be proven from the server without the owner logging in.
  // Each login screen (Google, X) can only refuse for a handful of reasons, and most
  // of them are visible from here: a missing or wrong ID, a secret the provider
  // rejects, or a callback address that does not match this site.
  {
    id: "conn-google-setup", group: "Connections", label: "Google sign-in setup",
    run: async (ctx, { origin }) => {
      const missing = ["GOOGLE_CONNECT_CLIENT_ID", "GOOGLE_CONNECT_CLIENT_SECRET", "GOOGLE_CONNECT_REDIRECT_URI"].filter((k) => !has(k));
      if (missing.length) return fail(`Missing in Vercel: ${missing.join(", ")}.`, "Add them from Google Cloud → APIs & Services → Credentials → your OAuth client, then redeploy.");
      const redirect = String(process.env.GOOGLE_CONNECT_REDIRECT_URI).trim();
      const expected = `${origin}/api/connect/google/callback`;
      if (redirect !== expected) return fail(`GOOGLE_CONNECT_REDIRECT_URI is ${redirect}, but this site needs ${expected}.`, "Set it to exactly that address in Vercel, add the same address under Authorized redirect URIs in Google Cloud, then redeploy.");
      // Google's sign-in page answers a bad client or an unregistered redirect with an
      // error page, and a good setup with a redirect onward to sign in.
      const q = new URLSearchParams({ client_id: String(process.env.GOOGLE_CONNECT_CLIENT_ID).trim(), redirect_uri: redirect, response_type: "code", scope: "openid email" });
      const page = await fetch(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      // Google does not answer a bad setup with an error page: it redirects to
      // /signin/oauth/error with the reason base64-encoded in `authError`
      // (verified against Google with a fake client: it decodes to invalid_client).
      let reason = "";
      const loc = page.headers.get("location") || "";
      if (/\/signin\/oauth\/error/.test(loc)) {
        try {
          const a = new URL(loc).searchParams.get("authError") || "";
          reason = Buffer.from(a.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
        } catch {}
        reason = reason || "unknown";
      } else if (page.status >= 400) {
        reason = await page.text().catch(() => String(page.status));
      }
      if (/redirect_uri_mismatch/i.test(reason)) return fail(`Google does not have ${redirect} registered for this OAuth client.`, "Google Cloud → APIs & Services → Credentials → your OAuth client → Authorized redirect URIs: add that exact address, save, wait five minutes.");
      if (/invalid_client|deleted_client|client was not found/i.test(reason)) return fail("Google does not recognise GOOGLE_CONNECT_CLIENT_ID.", "Copy the Client ID again from Google Cloud → Credentials into Vercel, then redeploy.");
      if (reason) return warn(`Google's sign-in page refused the setup (${reason.replace(/[^\x20-\x7e]+/g, " ").trim().slice(0, 120)}).`, "Send this report to your developer.");
      // The secret is only checked when a code is exchanged: a made-up code tells a
      // rejected secret (invalid_client) apart from an accepted one (invalid_grant).
      const tok = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code: "selftest-invalid", redirect_uri: redirect, client_id: String(process.env.GOOGLE_CONNECT_CLIENT_ID).trim(), client_secret: String(process.env.GOOGLE_CONNECT_CLIENT_SECRET).trim() }),
        signal: AbortSignal.timeout(15000),
      });
      const tj = await tok.json().catch(() => ({}));
      if (tj.error === "invalid_client" || tj.error === "unauthorized_client") return fail("Google rejects GOOGLE_CONNECT_CLIENT_SECRET.", "Copy the client secret again from Google Cloud → Credentials into Vercel (or reset it there), then redeploy.");
      return pass("Client ID, secret and redirect address are all accepted by Google. If sign-in is still blocked, it is the consent screen: publish the app (Audience → In production).");
    },
  },
  {
    id: "conn-x-setup", group: "Connections", label: "X (Twitter) sign-in setup",
    run: async (ctx, { origin }) => {
      const missing = ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REDIRECT_URI"].filter((k) => !has(k));
      if (missing.length) return skip(`Not set up: ${missing.join(", ")} missing in Vercel.`, "Optional. Only needed for Genie to post to X.");
      const clientId = String(process.env.X_CLIENT_ID).trim();
      const redirect = String(process.env.X_REDIRECT_URI).trim();
      const expected = `${origin}/api/connect/x/callback`;
      if (redirect !== expected) return fail(`X_REDIRECT_URI is ${redirect}, but this site needs ${expected}.`, "Set it to exactly that in Vercel and in the X portal → your app → User authentication settings → Callback URI, then redeploy.");
      // An OAuth 2.0 Client ID is base64 of "<id>:1:ci". The API Key (consumer key)
      // looks similar and is the most common thing pasted here by mistake.
      let decoded = "";
      try { decoded = Buffer.from(clientId, "base64").toString("utf8"); } catch {}
      if (!/:1:ci$/.test(decoded)) return fail("X_CLIENT_ID is not an OAuth 2.0 Client ID. It looks like the API Key (consumer key) instead.", "X portal → your app → Keys and tokens → OAuth 2.0 Client ID and Client Secret. Copy those two into X_CLIENT_ID and X_CLIENT_SECRET, then redeploy.");
      // A made-up refresh token tells a rejected client (401 unauthorized_client) apart
      // from an accepted one (400 invalid_request about the token).
      const basic = Buffer.from(`${clientId}:${String(process.env.X_CLIENT_SECRET).trim()}`).toString("base64");
      const r = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "selftest-invalid", client_id: clientId }), signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 || j.error === "unauthorized_client" || j.error === "invalid_client") {
        // Connecting X was removed: Genie writes X posts and the owner pastes them.
        // Old X settings left in Vercel are unused, not broken.
        if (!ctx.xConn) return skip("Not used. X posts are copy and paste now, so there is nothing to connect.", "Optional tidy-up: delete X_CLIENT_ID, X_CLIENT_SECRET and X_REDIRECT_URI in Vercel.");
        return fail(`X rejects the client ID and secret together (${j.error || r.status}).`, "In the X portal, regenerate the OAuth 2.0 Client Secret, paste it into X_CLIENT_SECRET, redeploy. Also check Type of App is \"Web App, Automated App or Bot\" (a Native App has no secret).");
      }
      const connected = ctx.xConn ? ` Connected as @${ctx.xConn.meta?.handle || "?"}.` : "";
      return pass(`Client ID and secret are accepted by X, and the callback matches this site.${connected}${ctx.xConn ? "" : " If X still says \"You weren't able to give access\", it is the app's settings in the X portal: OAuth 2.0 on, Web App type, Read and write permissions, and the app inside a Project."}`);
    },
  },
  {
    id: "conn-wordpress", group: "Connections", label: "WordPress (auto-publishing)",
    run: async (ctx) => {
      if (!ctx.wpConn) return skip("No blog connected.", "Optional. Connect WordPress on the Connections page so articles publish themselves.");
      const m = ctx.wpConn.meta || {};
      const { safeFetch } = await import("@/lib/ssrf");
      try {
        const { res } = await safeFetch(`${m.siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
          headers: { Authorization: "Basic " + Buffer.from(`${m.username}:${ctx.wpConn.access_token}`).toString("base64") }, signal: AbortSignal.timeout(15000),
        });
        if (res.status === 401 || res.status === 403) return fail(`${m.siteUrl} now rejects the saved application password.`, "Create a new application password in WordPress (Users → Profile) and reconnect.");
        if (!res.ok) return fail(`${m.siteUrl} answered ${res.status}.`, "Check the site is up and its REST API is enabled.");
        const me = await res.json();
        const can = me?.capabilities?.publish_posts || me?.capabilities?.edit_posts;
        return can ? pass(`${m.siteUrl}: signed in as ${me?.name || m.username}, allowed to publish.`) : fail(`${m.siteUrl}: ${me?.name || m.username} cannot publish posts.`, "Use an Author, Editor or Administrator account.");
      } catch (e) {
        return fail(`Could not reach ${m.siteUrl}: ${String(e?.message || e)}.`, "Check the site is up.");
      }
    },
  },

  {
    // The check that decides whether Genie is building the OWNER's ranking or
    // only its own: are articles actually served on the owner's domain?
    id: "own-site", group: "Connections", label: "Articles on your own domain",
    run: async (ctx) => {
      if (ctx.wpConn) return pass("WordPress is connected, so articles publish to your own domain.");
      const { blogConnection, markerValue, hasMarker } = await import("@/lib/own-blog");
      const conn = await blogConnection(ctx.supabase, ctx.userId);
      const m = conn?.meta;
      if (!m) return warn("Articles only go to your Genie page, which builds Genie's domain, not yours.", "Connections → Your blog on your own website. One rule on your site, then every article publishes there automatically.");
      if (!m.verifiedAt) return warn(`Waiting for the rule on ${m.host}${m.path}.`, "Add the rule shown on the Connections page (or email it to your developer), then press Check.");
      const { safeFetch } = await import("@/lib/ssrf");
      try {
        const { res } = await safeFetch(m.base, { signal: AbortSignal.timeout(15000) });
        const text = await res.text();
        return hasMarker(text, markerValue(m.handle, ctx.userId))
          ? pass(`${m.base} is live and serving your articles.`)
          : fail(`${m.base} no longer shows Genie's articles (answered ${res.status}).`, "The rule on your site was removed or changed. Put it back, or press Stop on the Connections page.");
      } catch (e) {
        return fail(`Could not open ${m.base}: ${String(e?.message || e)}.`, "Check your site is up.");
      }
    },
  },

  {
    // The testers and improvers (lib/swarm): is the crowd awake, and how much
    // free AI does it have to work with?
    id: "swarm", group: "Connections", label: "Your team: testers and improvers",
    run: async (ctx) => {
      const { freeProviderNames, freeProvidersReady } = await import("@/lib/ai-router");
      const { getEvents } = await import("@/lib/events");
      const keyed = freeProvidersReady();
      const evs = await getEvents(ctx.supabase, { userId: ctx.userId, types: ["swarm.tested"], limit: 1 });
      const last = evs[0]?.created_at ? Date.parse(evs[0].created_at) : 0;
      const hours = last ? Math.round((Date.now() - last) / 36e5) : null;
      const capacity = `${keyed.length} of ${freeProviderNames().length} free AI services ready (${keyed.join(", ") || "none"})`;
      if (!last) return warn(`The crowd has not tested anything yet. ${capacity}.`, "It runs after tonight's nightly run. To have it run during the day as well, add the heartbeat: GitHub repo Settings → Secrets and variables → Actions → secret HEARTBEAT_SECRET (the same value as HEARTBEAT_SECRET in Vercel) and variable GENIE_URL. GitHub fires it a handful of times a day, not every ten minutes as its schedule asks.");
      if (hours > 26) return warn(`Last test ${hours} hours ago. ${capacity}.`, "Check the Genie heartbeat in GitHub Actions, and that drafts are waiting in Approvals.");
      return keyed.length < 3
        ? warn(`Testing (last ${hours}h ago), but only ${capacity}. When they run out it switches to quick checks.`, "Add more free AI keys in Vercel for full-size tests all day: CEREBRAS_API_KEY, MISTRAL_API_KEY, or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN.")
        : pass(`Testing (last ${hours}h ago). ${capacity}.`);
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
        // Search working through the backup IS search working. Marking it "Check"
        // made a healthy result look broken; Gemini's own state is reported by the
        // "AI provider: Google Gemini" check.
        const quota = /429|quota/i.test(why);
        return pass(`Search works: "${q}" returned ${r.length} results through the backup (Tavily), e.g. ${r[0].url}. Gemini search is ${quota ? "out of free quota" : "unavailable"} right now, which is fine.`);
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

  // IS IT COMPOUNDING?
  // The question that matters after a month is not "does each engine answer" but
  // "is there more of everything than last week": more places pitched, more links
  // live, more pages, more AI answers naming you.
  {
    id: "compounding", group: "Is it compounding?", label: "New places, links and pages over the last 30 days",
    run: async (ctx) => {
      const s2 = needHost(ctx); if (s2) return s2;
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const week = new Date(Date.now() - 7 * 864e5).toISOString();
      const count = async (table, build) => { try { const { count: c } = await build(ctx.supabase.from(table).select("id", { count: "exact", head: true })); return c || 0; } catch { return 0; } };

      const { MEDIA_TYPE } = await import("@/lib/media-store");
      const places30 = await count("actions", (q) => q.eq("user_id", ctx.userId).eq("type", MEDIA_TYPE).gte("created_at", since));
      const places7 = await count("actions", (q) => q.eq("user_id", ctx.userId).eq("type", MEDIA_TYPE).gte("created_at", week));
      const pages30 = await count("published_pages", (q) => q.eq("user_id", ctx.userId).gte("published_at", since));
      const sent30 = await count("outreach_log", (q) => q.eq("user_id", ctx.userId).gte("created_at", since).in("status", ["sent", "opened", "replied"]));
      const buyers7 = await count("placements", (q) => q.eq("user_id", ctx.userId).gte("created_at", week));

      // Links other sites actually gave you: the nightly backlink scan records one
      // event per confirmed link, so this is earned, not claimed.
      let links = 0;
      try {
        const { getEvents } = await import("@/lib/events");
        const evs = await getEvents(ctx.supabase, { userId: ctx.userId, types: ["link.earned"], limit: 500 });
        links = new Set(evs.map((e) => e?.data?.domain || e?.subject).filter(Boolean)).size;
      } catch {}

      const line = `Last 30 days: ${places30} places found to be featured on (${places7} this week), ${pages30} articles published, ${sent30} outreach emails sent, ${buyers7} buyers found this week, ${links} link${links === 1 ? "" : "s"} confirmed live on other sites.`;
      if (places30 === 0 && pages30 === 0 && sent30 === 0) {
        return fail(`Nothing has accumulated yet. ${line}`, "The nightly engine has not produced anything for this business. Check the Setup and AI checks above, then look at /diagnostics → Engine activity.");
      }
      if (places7 === 0) return warn(`${line} No NEW places this week.`, "Each night Genie rotates through a different play (roundups, guest posts, directories, press, partners, broken links). If this stays at zero, send this report.");
      return pass(line);
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
  // ── OUTREACH SAFETY AND PACE ──
  {
    id: "contacts-safe", group: "Outreach and website", label: "Who Genie is allowed to write to",
    run: async (ctx) => {
      const { checkSource } = await import("@/lib/contact-source");
      const { roleFit } = await import("@/lib/role-fit");
      const { audienceOf, CUSTOMER, PARTNER } = await import("@/lib/audience");
      // Read the pool exactly the way sourceContacts() does. directory_contacts is
      // SHARED across the whole customer base on purpose — one row per address, so
      // a bounce is never retried by a second owner — which is why it has no
      // user_id. This check asked for one, and reported a real fail against a column
      // that was never supposed to exist.
      const { data, error } = await ctx.supabase.from("directory_contacts")
        .select("email, source, industry, company, status")
        .eq("is_genie_lead", false)
        .not("status", "in", "(unsubscribed,bounced)")
        .limit(200);
      if (error) return fail(`Cannot read the contact pool: ${String(error.message).slice(0, 120)}.`, "Open /diagnostics — a table or column is probably missing.");
      const rows = data || [];
      if (!rows.length) return skip("No contacts found yet.", "Run Find clients once, then run this check again.");
      let refusedSource = 0, refusedRole = 0, partners = 0, customers = 0;
      for (const c of rows) {
        if (!checkSource(c.source).ok) refusedSource++;
        // "offer" is the purpose the real send uses, so this counts what outreach
        // would actually accept rather than a looser hypothetical.
        if (!roleFit(c.email, { purpose: "offer" }).ok) refusedRole++;
        const a = audienceOf(c);
        if (a === PARTNER) partners++; else if (a === CUSTOMER) customers++;
      }
      const sendable = rows.length - refusedSource - refusedRole;
      const detail = `${rows.length} in the shared pool: ${sendable} sendable, ${refusedSource} refused on where the address was found, ${refusedRole} refused on the address itself (no-reply, legal, abuse). ${customers} read as buyers, ${partners} as agency partners.`;
      if (sendable <= 0) return fail(`Nothing is sendable. ${detail}`, "Every contact is being refused. Check that Find clients is recording where each address was published.");
      if (refusedSource > rows.length / 2) return warn(detail, "More than half are refused on where they came from — usually a missing source on older rows. New ones record it.");
      return pass(detail);
    },
  },
  {
    id: "ramp", group: "Outreach and website", label: "How many emails today",
    run: async (ctx) => {
      const { effectiveDailyCap } = await import("@/lib/sending-ramp");
      const r = await effectiveDailyCap(ctx.supabase, ctx.userId, ctx.profile?.plan || "free");
      if (!r?.cap) return fail("No sending cap could be worked out, so the nightly send has nothing to obey.", "Send this report to your developer.");
      return pass(`${r.reason} ${r.ramping ? `Warming up — ${r.days} day${r.days === 1 ? "" : "s"} of sending so far.` : "Fully warmed up."}`);
    },
  },
  {
    id: "followups", group: "Outreach and website", label: "Second and third emails",
    run: async (ctx) => {
      const { error } = await ctx.supabase.from("outreach_log").select("is_followup, followup_step, source, body").limit(0);
      if (error) return fail("The send log is missing the follow-up columns, so a second email can never be sent or counted.", "Run db/outreach-followup.sql in Supabase → SQL Editor, then run this check again.");
      const { dueFollowUps, MAX_FOLLOWUPS, STEP_AFTER_DAYS } = await import("@/lib/followup");
      const rule = `Up to ${MAX_FOLLOWUPS} follow-ups, after ${STEP_AFTER_DAYS.join(" and ")} days.`;
      const { count } = await ctx.supabase.from("outreach_log").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).not("sent_at", "is", null);
      if (!count) return skip(`Nothing has been sent yet. ${rule}`, "Follow-ups start once the first email goes out.");
      const { due, cold } = await dueFollowUps(ctx.supabase, ctx.userId, ctx.host || null, { limit: 25 });
      return pass(`${rule} Right now: ${due.length} due tonight, ${cold.length} gone quiet and being left alone.`);
    },
  },

  // ── IS IT LEARNING? ──
  {
    id: "lookalike", group: "Is it compounding?", label: "Looking for more like the people who replied",
    run: async (ctx) => {
      const { repliedProfile, lookalikeNote, lookalikeNiche, MIN_REPLIES } = await import("@/lib/lookalike");
      const p = await repliedProfile(ctx.supabase, { userId: ctx.userId, host: ctx.host || null });
      if (!p.total) return skip(`No replies yet. ${MIN_REPLIES} are needed before Genie narrows the search.`, "Normal early on.");
      const want = niche(ctx);
      const r = lookalikeNiche(p, want);
      const note = lookalikeNote(p) || `${p.total} replies so far.`;
      return r.changed
        ? pass(`${note} Tonight it searches "${r.niche}" instead of "${want}".`)
        : warn(note, p.total < MIN_REPLIES ? null : "Not enough of your replies come from one kind of company yet, so the search is unchanged. That is the honest answer, not a failure.");
    },
  },
  {
    id: "owner-signal", group: "Is it compounding?", label: "Learning from what you skip and rewrite",
    run: async (ctx) => {
      const { ownerSignal } = await import("@/lib/owner-signal");
      const { data } = await ctx.supabase.from("decisions").select("kind").eq("user_id", ctx.userId).in("kind", ["skipped", "edited", "approval"]).limit(500);
      const rows = data || [];
      if (!rows.length) return skip("You have not approved, skipped or rewritten anything yet.", "Clear a few cards in Approvals, then run this check again.");
      const n = (k) => rows.filter((r) => r.kind === k).length;
      const sig = await ownerSignal(ctx.supabase, ctx.userId);
      const applied = Object.keys(sig.skips).length + sig.edits.size;
      const counted = `${n("approval")} approved, ${n("skipped")} skipped, ${n("edited")} rewritten.`;
      if (!n("skipped") && !n("edited")) return pass(`${counted} Nothing to learn from yet — Genie learns most from the ones you skip or rewrite.`);
      return applied
        ? pass(`${counted} ${applied} of those patterns now change what Genie queues and how hard it edits.`)
        : warn(`${counted} Not applied yet — the nightly learning run turns these into changes.`, "Applies after tonight's run, or open the Learning page and run it now.");
    },
  },
];

export const CHECK_INDEX = Object.fromEntries(CHECKS.map((c) => [c.id, c]));
