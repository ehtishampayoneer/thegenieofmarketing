"use client";

// ── IMPACT — the proof ──
// The surface that turns "Genie was busy" into "Genie earned you $X." Reads
// /api/impact (real conversion.recorded events, provider-agnostic) with honest
// provenance: verified revenue from a connected source, or an honest empty state
// + a provider-agnostic "connect your revenue" setup. Demo only for the preview.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Provenance } from "@/components/ui/v2/primitives";
import { fetchLive, relTime } from "@/lib/live";

const FALLBACK = {
  conversions: 23, value: 4820, currency: "USD", attributed: 17,
  bySource: [{ source: "reddit", count: 9 }, { source: "email", count: 6 }, { source: "blog", count: 5 }, { source: "stripe", count: 3 }],
  recent: [
    { at: null, value: 249, source: "reddit", campaign: "ar-try-before-you-buy" },
    { at: null, value: 89, source: "email", campaign: "outreach" },
    { at: null, value: 349, source: "blog", campaign: "ar-trends-2026" },
  ],
  ingest: { token: "demo-token", base: "", providers: [{ id: "stripe", label: "Stripe" }, { id: "shopify", label: "Shopify" }, { id: "paddle", label: "Paddle" }, { id: "lemonsqueezy", label: "Lemon Squeezy" }] },
};

export default function ImpactPage() {
  const [d, setD] = useState(FALLBACK);
  const [live, setLive] = useState(false);
  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/impact");
      if (live && data) { setD({ ...FALLBACK, ...data, ingest: data.ingest || FALLBACK.ingest }); setLive(true); }
    })();
  }, []);

  const hasRevenue = d.conversions > 0;
  const money = fmtMoney(d.value, d.currency);

  return (
    <OperatorShell active="impact">
      <div className="mg-rise flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-medium mg-muted">
            <Icon.bolt size={15} /> Impact {live ? (hasRevenue ? <Provenance kind="verified">Real revenue</Provenance> : <Provenance kind="early" />) : <Provenance kind="sample" />}
          </p>
          <h1 className="mt-2 text-[32px] leading-[1.08] font-extrabold tracking-tight" style={{ color: "var(--fg)" }}>
            What Genie has <span className="dawn-text">actually earned you.</span>
          </h1>
          <p className="mt-2.5 text-[15px] mg-muted">Real revenue and customers Genie drove — traced from the action to the sale. Not activity, results.</p>
        </div>
      </div>

      {live && !hasRevenue ? (
        <ConnectRevenue ingest={d.ingest} empty />
      ) : (
        <>
          {/* headline numbers */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-5">
              <p className="text-[12px] mg-muted">Revenue Genie influenced</p>
              <p className="mt-1.5 text-[36px] font-bold leading-none mg-num" style={{ color: "var(--accent-ink)" }}>{money}</p>
              <p className="mt-2 text-[12px] mg-subtle">{live ? "from connected revenue" : "sample"}</p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] mg-muted">Customers / conversions</p>
              <p className="mt-1.5 text-[36px] font-bold leading-none mg-num" style={{ color: "var(--fg)" }}>{d.conversions}</p>
              <p className="mt-2 text-[12px] mg-subtle">last 500 events</p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] mg-muted">Traced to a Genie action</p>
              <p className="mt-1.5 text-[36px] font-bold leading-none mg-num" style={{ color: "var(--fg)" }}>{d.attributed}<span className="text-[18px] mg-subtle"> / {d.conversions}</span></p>
              <p className="mt-2 text-[12px] mg-subtle">the rest is context</p>
            </Card>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            {/* recent conversions */}
            <Card className="overflow-hidden">
              <div className="px-5 pt-5 pb-3"><h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Recent conversions</h2></div>
              <div className="px-3 pb-2">
                {(d.recent || []).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-3" style={{ borderTop: "1px solid var(--hair)" }}>
                    <span className="mg-tile" style={{ width: 34, height: 34, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><Icon.check size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{fmtMoney(r.value, d.currency)}</p>
                      <p className="text-[12px] mg-muted truncate mt-0.5">via {r.source}{r.campaign ? ` · ${r.campaign}` : ""}</p>
                    </div>
                    <span className="text-[11px] mg-subtle mg-num">{r.at ? relTime(r.at) : ""}</span>
                  </div>
                ))}
                {(!d.recent || d.recent.length === 0) && <p className="px-2 py-4 text-[13px] mg-subtle">No conversions recorded yet.</p>}
              </div>
            </Card>

            {/* by source */}
            <Card className="p-5 self-start">
              <h3 className="text-[13.5px] font-bold mb-3" style={{ color: "var(--fg)" }}>Where it came from</h3>
              <div className="space-y-2.5">
                {(d.bySource || []).map((s) => {
                  const max = Math.max(...(d.bySource || []).map((x) => x.count), 1);
                  return (
                    <div key={s.source} className="flex items-center gap-3">
                      <span className="text-[12px] mg-muted w-20 shrink-0 capitalize truncate">{s.source}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                        <div className="h-full rounded-full dawn-fill" style={{ width: `${(s.count / max) * 100}%` }} />
                      </div>
                      <span className="text-[12px] font-semibold mg-num w-5 text-right" style={{ color: "var(--fg)" }}>{s.count}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="mt-5"><ConnectRevenue ingest={d.ingest} /></div>
        </>
      )}
    </OperatorShell>
  );
}

// Provider-agnostic setup: one webhook URL per provider, from the ingest token.
function ConnectRevenue({ ingest, empty }) {
  const [copied, setCopied] = useState("");
  const providers = ingest?.providers || [];
  function urlFor(id) { return `${ingest?.base || ""}/api/webhooks/${id}?k=${ingest?.token || ""}`; }
  async function copy(id) { try { await navigator.clipboard.writeText(urlFor(id)); setCopied(id); setTimeout(() => setCopied(""), 1800); } catch {} }
  return (
    <Card className="p-6" style={empty ? { marginTop: 24, borderColor: "var(--accent)", boxShadow: "var(--shadow-dawn)" } : {}}>
      <div className="flex items-center gap-2">
        <Icon.link size={16} />
        <h3 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{empty ? "Connect your revenue so Genie can prove what it earns you" : "Connect your revenue"}</h3>
      </div>
      <p className="mt-1.5 text-[13px] mg-muted max-w-2xl">Point any payment provider’s webhook at your private URL below. Genie records each sale, traces it to the action that drove it, and learns from real money. Works with any provider — pick yours.</p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {providers.map((p) => (
          <div key={p.id} className="mg-surface-quiet p-3 flex items-center gap-2.5">
            <span className="text-[13px] font-semibold w-28 shrink-0" style={{ color: "var(--fg)" }}>{p.label}</span>
            <code className="flex-1 min-w-0 text-[11px] mg-subtle truncate" style={{ fontFamily: "var(--font-mono)" }}>{urlFor(p.id)}</code>
            <button onClick={() => copy(p.id)} className="mg-btn mg-btn--quiet shrink-0" style={{ fontSize: 11.5, padding: ".35rem .6rem" }}>{copied === p.id ? "Copied" : "Copy"}</button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] mg-subtle">Provider-agnostic by design — Stripe, Shopify, Paddle, Lemon Squeezy, and more are each a thin adapter. Your URL is private to your account.</p>
    </Card>
  );
}

function fmtMoney(value, currency = "USD") {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value) || 0); }
  catch { return `$${Math.round(Number(value) || 0).toLocaleString()}`; }
}
