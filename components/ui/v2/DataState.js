"use client";

// ── DATA-STATE UI ──
// A development-time truth badge (so you always know if a screen shows REAL data,
// is EMPTY, or is DISCONNECTED) + one honest empty state in Genie's voice that
// always points back to the first scan. No "sample preview" anymore.

import Icon from "@/components/ui/Icon";

export function DataStateBadge({ state }) {
  switch (state) {
    case "real": return <span className="mg-pill mg-pill--live"><span className="mg-live-dot" /> Live data</span>;
    case "empty": return <span className="mg-pill">Empty · no data yet</span>;
    case "disconnected": return <span className="mg-pill mg-pill--danger">Disconnected</span>;
    default: return <span className="mg-pill">Loading…</span>;
  }
}

// Honest empty state. `disconnected` variant nudges to sign in / run first scan.
export function EmptyState({ state = "empty", icon: IconC = Icon.spark, title, sub, action }) {
  const disconnected = state === "disconnected";
  return (
    <div className="mg-surface mg-rise" style={{ padding: "44px 32px", textAlign: "center", marginTop: 20 }}>
      <span className="mg-tile" style={{ width: 48, height: 48, margin: "0 auto", background: disconnected ? "var(--signal-danger-soft)" : "var(--accent-quiet)", color: disconnected ? "var(--signal-danger)" : "var(--accent-ink)" }}>
        <IconC size={22} />
      </span>
      <p style={{ marginTop: 14, fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>
        {title || (disconnected ? "Not connected" : "Nothing here yet")}
      </p>
      <p className="mg-muted" style={{ marginTop: 7, fontSize: 14, lineHeight: 1.5, maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
        {sub || (disconnected
          ? "I can’t reach your account right now. Sign in and try again."
          : "This fills up the moment I finish your first scan. Point me at your website and I’ll build everything from scratch.")}
      </p>
      <div style={{ marginTop: 18 }}>
        {action || (
          <a href={disconnected ? "/login" : "/welcome"} className="mg-btn mg-btn--dawn" style={{ fontSize: 13.5 }}>
            {disconnected ? "Sign in →" : "Run my first scan →"}
          </a>
        )}
      </div>
    </div>
  );
}
