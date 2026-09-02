"use client";

// ── DATA-STATE UI ──
// A development-time truth badge (so you always know if a screen shows REAL data,
// is EMPTY, or is DISCONNECTED) + one honest empty state in Genie's voice that
// always points back to the first scan. No "sample preview" anymore.

import Icon from "@/components/ui/Icon";
import GenieAperture from "@/components/brand/GenieAperture";

export function DataStateBadge({ state }) {
  switch (state) {
    case "real": return <span className="mg-pill mg-pill--live"><span className="mg-live-dot" /> Live data</span>;
    case "empty": return <span className="mg-pill">Empty · no data yet</span>;
    case "disconnected": return <span className="mg-pill mg-pill--danger">Disconnected</span>;
    default: return <span className="mg-pill">Loading…</span>;
  }
}

// Loading skeleton — shown WHILE data is being fetched, so a page never flashes
// its "empty / run your first scan" CTA before the real data arrives (that flash
// read as two different pages loading in a row). Generic shimmer that fits any
// layout; pages with a bespoke layout can pass their own via children.
export function LoadingState({ rows = 3, children, label = "Gathering your data" }) {
  if (children) return <div className="mt-6">{children}</div>;
  return (
    <div className="mg-surface mg-rise" style={{ padding: 22, marginTop: 20 }} aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3.5">
        <GenieAperture size={44} state="scanning" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold flex items-center gap-2" style={{ color: "var(--fg)" }}>
            Genie is working
            <span className="mg-thinking"><i /><i /><i /></span>
          </p>
          <p className="text-[13px] mg-subtle mt-0.5">{label}…</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="mg-skel" style={{ height: 58, opacity: 1 - i * 0.14 }} />
        ))}
      </div>
    </div>
  );
}

// Honest empty state. `disconnected` variant nudges to sign in / run first scan.
export function EmptyState({ state = "empty", icon: IconC = Icon.spark, title, sub, action }) {
  const disconnected = state === "disconnected";
  return (
    <div className="mg-surface mg-rise" style={{ padding: "48px 32px", textAlign: "center", marginTop: 20 }}>
      <div style={{ display: "grid", placeItems: "center", marginBottom: disconnected ? 0 : 26 }}>
        {disconnected
          ? <span className="mg-tile" style={{ width: 52, height: 52, background: "var(--signal-danger-soft)", color: "var(--signal-danger)" }}><IconC size={24} /></span>
          : <GenieAperture size={82} state="idle" />}
      </div>
      <p style={{ marginTop: disconnected ? 14 : 0, fontSize: 18, fontWeight: 700, color: "var(--fg)", letterSpacing: "-.01em" }}>
        {title || (disconnected ? "Not connected" : "Nothing here yet")}
      </p>
      <p className="mg-muted" style={{ marginTop: 7, fontSize: 14, lineHeight: 1.5, maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
        {sub || (disconnected
          ? "I can’t reach your account right now. Sign in and try again."
          : "This fills in from your scan as I work. If it’s been a few minutes, refresh, or connect the missing account.")}
      </p>
      <div style={{ marginTop: 18 }}>
        {action || (disconnected
          ? <a href="/login" className="mg-btn mg-btn--dawn" style={{ fontSize: 14 }}>Sign in →</a>
          : <button onClick={() => window.location.reload()} className="mg-btn mg-btn--dawn" style={{ fontSize: 14 }}>Refresh</button>
        )}
      </div>
    </div>
  );
}
