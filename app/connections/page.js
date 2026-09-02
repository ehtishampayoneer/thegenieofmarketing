"use client";

// ── CONNECTIONS ──
// The one setup surface. The more Genie can see (analytics, revenue) and reach
// (publishing), the more of its results become real, measured numbers. Reads the
// live /api/connections/status; shows exactly what's connected and what still
// needs setup, with the action for each. Provider-agnostic revenue setup.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Card, Button } from "@/components/ui/v2/primitives";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import { DataStateBadge } from "@/components/ui/v2/DataState";
import { fetchLive } from "@/lib/live";

// Plain-language reasons a Google connect can fail. Before this existed, the OAuth
// callback redirected back with ?connect_error=… and the page showed NOTHING — the
// owner saw "not connected" after granting access, with no way to know why.
const CONNECT_ERRORS = {
  state: "Security check failed — the sign-in took too long, or cookies were blocked. Please try connecting again.",
  exchange: "Google rejected the sign-in. Check that the redirect URL in your Google Cloud console exactly matches this site, then try again.",
  save: "Google signed you in, but Genie couldn't save the connection. This usually means the database is missing recent columns — run db/setup.sql in Supabase, then reconnect.",
  access_denied: "You declined the permissions, so Genie can't read your data. Connect again and approve access.",
};

// "Google connected" and "we found your Search Console property" are DIFFERENT
// things. gsc_site is only filled in later, once an audit finds a verified property
// for this domain — so judging the Google row by it made a working connection read
// as "Connect Google" forever. Report the account state, then the detail.
function googleSub(I) {
  if (!I.google?.connected) return "Real rankings + traffic + real keyword search volume, AND lets Genie send outreach from your own Gmail";
  const have = [];
  const missing = [];
  (I.search_console?.connected ? have : missing).push("Search Console");
  (I.ga4?.connected ? have : missing).push("Analytics");
  let s = `Connected${have.length ? ` · ${have.join(" + ")} live` : ""}`;
  if (missing.length) s += ` · ${missing.join(" and ")} ${missing.length > 1 ? "aren’t" : "isn’t"} reporting yet — that starts after Genie’s next run, or if the site isn’t a verified property in your Google account`;
  return s;
}

const FALLBACK = {
  integrations: {
    google: { label: "Google", connected: false, category: "measure" },
    search_console: { label: "Google Search Console", connected: false, category: "measure" },
    ga4: { label: "Google Analytics (GA4)", connected: false, category: "measure" },
    wordpress: { label: "WordPress", connected: false, category: "publish" },
    x: { label: "X (Twitter)", connected: false, category: "publish" },
    email: { label: "Outreach email", connected: false, category: "reach", system: true },
    commerce: { label: "Revenue", connected: false, category: "measure" },
  },
};

export default function ConnectionsPage() {
  const [d, setD] = useState(FALLBACK);
  const [state, setState] = useState("loading");
  const [ingest, setIngest] = useState(null);
  const [notice, setNotice] = useState(null);

  // Report the outcome of an OAuth round-trip, in words the owner can act on.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const err = p.get("connect_error");
      if (err) setNotice({ tone: "error", text: CONNECT_ERRORS[err] || `Couldn't connect (${err}). Please try again.` });
      else if (p.get("connected")) setNotice({ tone: "ok", text: "Connected. Genie can now read your real data." });
      if (err || p.get("connected")) window.history.replaceState({}, "", window.location.pathname);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/connections/status");
      if (live && data?.integrations) {
        setD(data); setState("real");
        // "Couldn't check" is NOT the same as "not connected" — never imply the latter.
        if (data.degraded) setNotice({ tone: "error", text: "Genie couldn't read your connections, so the statuses below may be wrong. This usually means the database needs db/setup.sql run in Supabase." });
      } else setState("disconnected");
      const imp = await fetchLive("/api/impact");
      if (imp.live && imp.data?.ingest) setIngest(imp.data.ingest);
    })();
  }, []);

  const I = d.integrations;
  return (
    <OperatorShell active="connections">
      <OperatorHeader
        icon={Icon.connect}
        label="Connections"
        provenance={<DataStateBadge state={state} />}
        title="Connect your world."
        accent="Genie does the rest."
      />

      {notice && (
        <div className="mb-4 p-3.5 rounded-lg text-[13px] flex items-start gap-2.5" style={{
          background: notice.tone === "error" ? "var(--signal-danger-soft)" : "var(--signal-live-soft)",
          border: `1px solid ${notice.tone === "error" ? "var(--signal-danger)" : "var(--signal-live)"}`,
          color: "var(--fg)",
        }}>
          <span className="shrink-0 mt-0.5" style={{ color: notice.tone === "error" ? "var(--signal-danger)" : "var(--signal-live-ink)" }}>
            {notice.tone === "error" ? <Icon.x size={16} /> : <Icon.check size={16} />}
          </span>
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 mg-subtle mg-focus" style={{ fontSize: 16, lineHeight: 1 }} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Measure */}
      <Group title="Measure your growth" sub="So Genie’s impact becomes real numbers, not estimates.">
        <Row icon={<BrandIcon brand="google" size={18} />} label="Google (Search Console, Analytics, Gmail, Keyword Planner)"
          sub={googleSub(I)}
          connected={I.google?.connected} action={<a href="/api/connect/google/start" className="mg-btn mg-btn--dawn" style={btn}>{I.google?.connected ? "Reconnect" : "Connect Google"}</a>} />
        <Row icon={<span className="mg-tile" style={tile}><Icon.store size={17} /></span>} label="Revenue (any provider)"
          sub={I.commerce.connected ? "Receiving real revenue events" : "Point your payment provider’s webhook here so Genie proves the dollars it earns you"}
          connected={I.commerce.connected} action={null}>
          {ingest && !I.commerce.connected && <RevenueSetup ingest={ingest} />}
        </Row>
      </Group>

      {/* Publish */}
      <Group title="Publish for you" sub="Genie auto-publishes only to your OWN site. On social it drafts and YOU post, one tap — so your accounts stay safe.">
        <Row icon={<BrandIcon brand="wordpress" size={18} />} label="WordPress (your blog)" sub={I.wordpress.connected ? "Connected · Genie auto-publishes approved articles" : "Genie auto-publishes approved articles here. Safe — it's your own site."}
          connected={I.wordpress.connected} action={<WordPressConnect connected={I.wordpress.connected} />} />
        <Row icon={<BrandIcon brand="x" size={18} />} label="X (Twitter)" sub={I.x.connected ? "Connected · Genie drafts, opens X, you tap post" : "Genie writes your tweets and threads and opens X with them ready — you tap post. It never auto-posts, to keep your account safe."}
          connected={I.x.connected} action={<a href="/api/connect/x/start" className="mg-btn mg-btn--ghost" style={btn}>{I.x.connected ? "Reconnect" : "Connect X"}</a>} />
      </Group>

      {/* Reach */}
      <Group title="Reach buyers" sub="So Genie can run outreach — compliantly, and actually land in the inbox.">
        <Row icon={<BrandIcon brand="mail" size={18} />} label="Outreach email" connectedLabel="Built-in · ready" sub={I.email.connected ? "Built in — every email is CAN-SPAM compliant (unsubscribe + address). Nothing to connect." : "Email sending is configured for you at the platform level"}
          connected={I.email.connected} action={null} />
        <DeliverabilityCheck />
      </Group>

      <p className="mt-8 mb-2 text-center text-[13px] mg-subtle">Genie stays useful even with nothing connected — but each connection makes its results more real and more automated.</p>
    </OperatorShell>
  );
}

const btn = { fontSize: 13, padding: ".5rem .9rem" };
const tile = { width: 34, height: 34, background: "var(--surface-sunken)", color: "var(--fg-muted)" };

function Group({ title, sub, children }) {
  return (
    <div className="mt-6">
      <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>{title}</h2>
      <p className="mt-0.5 text-[13px] mg-muted">{sub}</p>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ icon, label, sub, connected, connectedLabel = "Connected", action, children }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 flex-wrap">
        {icon}
        <div className="flex-1 min-w-[160px]">
          <p className="text-[14px] font-semibold flex items-center gap-2" style={{ color: "var(--fg)" }}>
            {label}
            {connected && <span className="mg-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg> {connectedLabel}</span>}
          </p>
          <p className="text-[12px] mg-muted mt-0.5">{sub}</p>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function RevenueSetup({ ingest }) {
  const [copied, setCopied] = useState("");
  const base = ingest?.base || "";
  const token = ingest?.token || "";
  const url = (id) => `${base}/api/webhooks/${id}?k=${token}`;
  async function copy(id, text) { try { await navigator.clipboard.writeText(text ?? url(id)); setCopied(id); setTimeout(() => setCopied(""), 1600); } catch {} }

  // The universal pixel — for any business NOT on a supported checkout. Drop on the
  // site (thank-you page auto-records via the data attribute). Same private token.
  const pixel = `<!-- Marketing Genie — records a sale so "Customers won" lights up.
     Put on your thank-you / order-confirmation page. Optionally set the value. -->
<script>
(function(){var K=${JSON.stringify(token)},B=${JSON.stringify(base)};
try{var q=new URLSearchParams(location.search);["utm_content","utm_campaign"].forEach(function(k){var v=q.get(k);if(v)localStorage.setItem("mg_"+k,v);});}catch(e){}
function s(k){try{return new URLSearchParams(location.search).get(k)||localStorage.getItem("mg_"+k)||"";}catch(e){return"";}}
window.genieConversion=function(value,currency,orderId){var id;try{id=orderId||sessionStorage.getItem("mg_oid")||(sessionStorage.setItem("mg_oid",Date.now().toString(36)),sessionStorage.getItem("mg_oid"));}catch(e){id=""+Date.now();}
var b=JSON.stringify({k:K,value:value||0,currency:currency||"USD",ref:s("utm_content"),campaign:s("utm_campaign"),dedupeKey:"px:"+id});
try{navigator.sendBeacon(B+"/api/px/conversion",new Blob([b],{type:"application/json"}));}catch(e){fetch(B+"/api/px/conversion",{method:"POST",headers:{"Content-Type":"application/json"},body:b,keepalive:true});}};
var el=document.currentScript;if(el&&el.getAttribute("data-genie-convert")!==null){window.genieConversion(el.getAttribute("data-genie-value"),el.getAttribute("data-genie-currency"),el.getAttribute("data-genie-order"));}
})();
</script>`;

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--hair)" }}>
      <p className="text-[12px] mg-muted mb-2">Add this webhook URL in your provider (Stripe, Shopify, Paddle, Lemon Squeezy…). Your URL is private to your account.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(ingest?.providers || []).map((p) => (
          <div key={p.id} className="mg-surface-quiet p-2.5 flex items-center gap-2">
            <span className="text-[13px] font-semibold w-24 shrink-0" style={{ color: "var(--fg)" }}>{p.label}</span>
            <code className="flex-1 min-w-0 text-[11px] mg-subtle truncate" style={{ fontFamily: "var(--font-mono)" }}>{url(p.id)}</code>
            <button onClick={() => copy(p.id)} className="mg-btn mg-btn--quiet shrink-0" style={{ fontSize: 11, padding: ".3rem .55rem" }}>{copied === p.id ? "✓" : "Copy"}</button>
          </div>
        ))}
      </div>

      {/* Universal pixel — no Stripe/Shopify needed */}
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>No Stripe or Shopify? Use the universal pixel</p>
          <button onClick={() => copy("__pixel", pixel)} className="mg-btn mg-btn--quiet shrink-0" style={{ fontSize: 11, padding: ".3rem .55rem" }}>{copied === "__pixel" ? "Copied ✓" : "Copy snippet"}</button>
        </div>
        <p className="text-[12px] mg-muted mb-2">
          Paste this on your thank-you / order-confirmation page. To auto-record a sale, add <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>data-genie-convert data-genie-value="49"</code> to the <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>&lt;script&gt;</code> tag, or call <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>genieConversion(total)</code> after checkout.
        </p>
        <pre className="mg-surface-quiet p-2.5 overflow-x-auto text-[11px] mg-subtle" style={{ fontFamily: "var(--font-mono)", lineHeight: 1.5, maxHeight: 150 }}>{pixel}</pre>
      </div>
    </div>
  );
}

// Email deliverability preflight — checks the sending domain's SPF/DKIM/DMARC so
// outreach actually reaches the inbox instead of silently dying in spam.
function DeliverabilityCheck() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try { const j = await fetch("/api/deliverability", { cache: "no-store" }).then((r) => r.json()); setD(j?.ok ? j : { error: true }); } catch { setD({ error: true }); }
    setBusy(false);
  }
  useEffect(() => { load(); }, []);
  if (!d) return null;

  const TONE = { ok: "var(--signal-live-ink)", warn: "var(--signal-warn)", fail: "var(--signal-danger)" };
  const DOT = { ok: "var(--signal-live)", warn: "var(--signal-warn)", fail: "var(--signal-danger)" };
  const r = d.report;
  const scoreColor = r ? (r.score >= 85 ? "var(--signal-live-ink)" : r.score >= 60 ? "var(--signal-warn)" : "var(--signal-danger)") : "var(--fg-muted)";

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="mg-tile" style={tile}><Icon.check size={17} /></span>
        <div className="flex-1 min-w-[160px]">
          <p className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>Email deliverability</p>
          <p className="text-[12px] mg-muted mt-0.5">
            {!d.connected ? "Connect Google above, then Genie checks whether your outreach will actually land in the inbox."
              : d.unknown || d.error ? (d.message || "Couldn't check right now.")
              : r ? <>Sending as <b>{d.sendingAs}</b> — {r.provider === "personal_gmail" ? "personal Gmail" : `domain ${r.domain}`}.</>
              : "Checking…"}
          </p>
        </div>
        {r && <span className="mg-num text-[20px] font-bold shrink-0" style={{ color: scoreColor }}>{r.score}<span className="text-[12px] mg-subtle">/100</span></span>}
        <button onClick={load} disabled={busy} className="mg-btn mg-btn--quiet shrink-0 disabled:opacity-50" style={{ fontSize: 12, padding: ".35rem .6rem" }}>{busy ? "Checking…" : "Recheck"}</button>
      </div>

      {r && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--hair)" }}>
          <div className="flex items-center gap-2 flex-wrap mb-2.5">
            <span className="text-[12px] font-semibold" style={{ color: scoreColor }}>{r.grade}</span>
            <span className="text-[12px] mg-subtle">· Suggested start: ~{r.volume.start}/day, ramp {r.volume.ramp}. {r.volume.note}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {r.checks.map((c) => (
              <div key={c.id} className="flex items-start gap-2 text-[12px]">
                <span style={{ width: 8, height: 8, borderRadius: 999, background: DOT[c.status], marginTop: 5, flexShrink: 0 }} />
                <span><b style={{ color: TONE[c.status] }}>{c.label}.</b> <span className="mg-muted">{c.note}</span></span>
              </div>
            ))}
          </div>
          {r.fixes?.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide mg-subtle mb-1.5">How to fix</p>
              <ul className="space-y-1.5">
                {r.fixes.map((f, i) => (
                  <li key={i} className="text-[12px] mg-muted flex gap-2"><span style={{ color: "var(--accent-ink)" }}>→</span><span style={{ fontFamily: /TXT|v=|include:|_domainkey|DMARC/.test(f) ? "var(--font-mono, monospace)" : undefined, fontSize: /TXT|v=|include:/.test(f) ? 11 : 12 }}>{f}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function WordPressConnect({ connected }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ siteUrl: "", username: "", appPassword: "" });
  const [state, setState] = useState("idle");
  async function connect() {
    setState("saving");
    try {
      const r = await fetch("/api/connect/wordpress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json();
      setState(j.ok ? "done" : "error");
      if (j.ok) setTimeout(() => window.location.reload(), 800);
    } catch { setState("error"); }
  }
  if (connected) return <a href="/api/connect/wordpress" onClick={(e) => e.preventDefault()} className="mg-btn mg-btn--quiet" style={btn}>Connected</a>;
  return (
    <div className="w-full">
      <button onClick={() => setOpen((v) => !v)} className="mg-btn mg-btn--ghost" style={btn}>{open ? "Close" : "Connect"}</button>
      {open && (
        <div className="mt-3 space-y-2 w-full">
          {[["siteUrl", "Site URL — https://yourblog.com"], ["username", "WordPress username"], ["appPassword", "Application password"]].map(([k, ph]) => (
            <input key={k} type={k === "appPassword" ? "password" : "text"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph}
              className="w-full px-3 py-2 rounded-lg text-[13px] mg-focus" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" }} />
          ))}
          <Button variant="dawn" onClick={connect} disabled={state === "saving"} style={btn}>{state === "saving" ? "Checking…" : "Connect WordPress"}</Button>
          {state === "error" && <p className="text-[12px]" style={{ color: "var(--signal-danger)" }}>Couldn’t connect — check your details.</p>}
          <p className="text-[11px] mg-subtle">Create an application password in wp-admin → Users → Profile → Application Passwords.</p>
        </div>
      )}
    </div>
  );
}
