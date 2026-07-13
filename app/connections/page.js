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

const FALLBACK = {
  integrations: {
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

  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/connections/status");
      if (live && data?.integrations) { setD(data); setState("real"); } else setState("disconnected");
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

      {/* Measure */}
      <Group title="Measure your growth" sub="So Genie’s impact becomes real numbers, not estimates.">
        <Row icon={<BrandIcon brand="google" size={18} />} label="Google (Search Console + Analytics)"
          sub={I.search_console.connected ? (I.ga4.connected ? "Connected · rankings + real traffic" : "Connected · enable Analytics for traffic proof") : "See your real keywords, rankings, and the traffic Genie drives"}
          connected={I.search_console.connected} action={<a href="/api/connect/google/start" className="mg-btn mg-btn--dawn" style={btn}>{I.search_console.connected ? "Reconnect" : "Connect Google"}</a>} />
        <Row icon={<span className="mg-tile" style={tile}><Icon.store size={17} /></span>} label="Revenue (any provider)"
          sub={I.commerce.connected ? "Receiving real revenue events" : "Point your payment provider’s webhook here so Genie proves the dollars it earns you"}
          connected={I.commerce.connected} action={null}>
          {ingest && !I.commerce.connected && <RevenueSetup ingest={ingest} />}
        </Row>
      </Group>

      {/* Publish */}
      <Group title="Publish for you" sub="So Genie can execute, not just draft.">
        <Row icon={<BrandIcon brand="wordpress" size={18} />} label="WordPress" sub={I.wordpress.connected ? "Connected · Genie can publish articles" : "Genie publishes approved articles to your blog"}
          connected={I.wordpress.connected} action={<WordPressConnect connected={I.wordpress.connected} />} />
        <Row icon={<BrandIcon brand="x" size={18} />} label="X (Twitter)" sub={I.x.connected ? "Connected · Genie can post" : "Genie posts approved tweets & threads"}
          connected={I.x.connected} action={<a href="/api/connect/x/start" className="mg-btn mg-btn--ghost" style={btn}>{I.x.connected ? "Reconnect" : "Connect X"}</a>} />
      </Group>

      {/* Reach */}
      <Group title="Reach buyers" sub="So Genie can run outreach — compliantly.">
        <Row icon={<BrandIcon brand="mail" size={18} />} label="Outreach email" sub={I.email.connected ? "Ready · every email is CAN-SPAM compliant (unsubscribe + address)" : "Set up by us — email sending is configured at the platform level"}
          connected={I.email.connected} action={null} />
      </Group>

      <p className="mt-8 mb-2 text-center text-[13px] mg-subtle">Genie stays useful even with nothing connected — but each connection makes its results more real and more automated.</p>
    </OperatorShell>
  );
}

const btn = { fontSize: 12.5, padding: ".5rem .9rem" };
const tile = { width: 34, height: 34, background: "var(--surface-sunken)", color: "var(--fg-muted)" };

function Group({ title, sub, children }) {
  return (
    <div className="mt-6">
      <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>{title}</h2>
      <p className="mt-0.5 text-[12.5px] mg-muted">{sub}</p>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ icon, label, sub, connected, action, children }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 flex-wrap">
        {icon}
        <div className="flex-1 min-w-[160px]">
          <p className="text-[13.5px] font-semibold flex items-center gap-2" style={{ color: "var(--fg)" }}>
            {label}
            {connected && <span className="mg-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg> Connected</span>}
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
  const url = (id) => `${ingest?.base || ""}/api/webhooks/${id}?k=${ingest?.token || ""}`;
  async function copy(id) { try { await navigator.clipboard.writeText(url(id)); setCopied(id); setTimeout(() => setCopied(""), 1600); } catch {} }
  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--hair)" }}>
      <p className="text-[11.5px] mg-muted mb-2">Add this webhook URL in your provider (Stripe, Shopify, Paddle, Lemon Squeezy…). Your URL is private to your account.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(ingest?.providers || []).map((p) => (
          <div key={p.id} className="mg-surface-quiet p-2.5 flex items-center gap-2">
            <span className="text-[12.5px] font-semibold w-24 shrink-0" style={{ color: "var(--fg)" }}>{p.label}</span>
            <code className="flex-1 min-w-0 text-[10.5px] mg-subtle truncate" style={{ fontFamily: "var(--font-mono)" }}>{url(p.id)}</code>
            <button onClick={() => copy(p.id)} className="mg-btn mg-btn--quiet shrink-0" style={{ fontSize: 11, padding: ".3rem .55rem" }}>{copied === p.id ? "✓" : "Copy"}</button>
          </div>
        ))}
      </div>
    </div>
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
          {state === "error" && <p className="text-[11.5px]" style={{ color: "var(--signal-danger)" }}>Couldn’t connect — check your details.</p>}
          <p className="text-[10.5px] mg-subtle">Create an application password in wp-admin → Users → Profile → Application Passwords.</p>
        </div>
      )}
    </div>
  );
}
