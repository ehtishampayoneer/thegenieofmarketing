"use client";

// ── IMPACT — the proof ──
// The surface that turns "Genie was busy" into "Genie earned you $X." Reads
// /api/impact (real conversion.recorded events, provider-agnostic) with honest
// provenance: verified revenue from a connected source, or an honest empty state
// + a provider-agnostic "connect your revenue" setup. Demo only for the preview.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { DataStateBadge, EmptyState } from "@/components/ui/v2/DataState";
import { relTime } from "@/lib/live";
import { useLive } from "@/lib/useLive";

export default function ImpactPage() {
  const { data: d, state } = useLive("/api/impact");
  const hasRevenue = (d?.conversions || 0) > 0;
  const money = fmtMoney(d?.value, d?.currency);
  const displayState = state === "real" ? (hasRevenue ? "real" : "empty") : state;

  return (
    <OperatorShell active="impact">
      <OperatorHeader
        icon={Icon.bolt}
        label="Impact"
        provenance={<DataStateBadge state={displayState} />}
        title="What Genie has"
        accent="actually earned you."
      />

      {state === "disconnected" ? (
        <EmptyState state="disconnected" icon={Icon.bolt} />
      ) : !d ? null : !hasRevenue ? (
        <ConnectRevenue ingest={d.ingest} empty />
      ) : (
        <>
          {/* headline — one dominant number, everything else in support */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4">
            <Card className="mg-ambient p-6 flex flex-col justify-center">
              <p className="mg-eyebrow">Revenue Genie influenced</p>
              <p className="mt-3 mg-display-lg mg-num" style={{ color: "var(--accent-ink)" }}>{money}</p>
              <p className="mt-2.5 text-[13px] mg-muted max-w-sm">{live ? "Traced from the action to the sale. Real money, not activity." : "Representative sample — connect revenue to see your own."}</p>
            </Card>
            <Card className="p-5 flex flex-col justify-center gap-3.5">
              <ImpactStat label="Customers won" sub="last 500 events" value={d.conversions} />
              <div className="mg-hairline" />
              <ImpactStat label="Traced to a Genie action" sub="the rest is context" value={<>{d.attributed}<span className="text-[15px] mg-subtle"> / {d.conversions}</span></>} />
              <div className="mg-hairline" />
              <ImpactStat label="Sessions Genie drove" sub={d.traffic?.share ? `${d.traffic.share}% of traffic · GA4` : "connect GA4"} value={(d.traffic?.genieSessions || 0).toLocaleString()} />
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

function ImpactStat({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[12.5px] mg-muted">{label}</p>
        {sub && <p className="text-[11px] mg-subtle mt-0.5">{sub}</p>}
      </div>
      <p className="mg-num text-[22px] font-bold leading-none shrink-0" style={{ color: "var(--fg)" }}>{value}</p>
    </div>
  );
}

function fmtMoney(value, currency = "USD") {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value) || 0); }
  catch { return `$${Math.round(Number(value) || 0).toLocaleString()}`; }
}
