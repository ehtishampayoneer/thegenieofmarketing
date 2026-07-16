"use client";

// ── DIAGNOSTICS & ENGINE CONSOLE (internal / dev) ──
// The one place to see exactly what Genie is doing, for real: which engines are
// ready, which providers are configured, how much each engine has produced, and
// the live activity stream. Everything comes from /api/diagnostics — no guessing.

import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { DataStateBadge, EmptyState } from "@/components/ui/v2/DataState";
import { useLive } from "@/lib/useLive";
import { relTime } from "@/lib/live";
import { useState } from "react";

export default function DiagnosticsPage() {
  const { data: d, state } = useLive("/api/diagnostics");
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  async function factoryReset() {
    if (!window.confirm("FULL RESET — wipe EVERYTHING for this account: scans, keywords, content, approvals, learnings, history, AND your connected accounts (Google / X / WordPress). Onboarding replays from scratch. Only your login stays. This cannot be undone. Continue?")) return;
    setResetting(true); setResetMsg("");
    try {
      const r = await fetch("/api/diagnostics/reset", { method: "POST" }).then((x) => x.json());
      setResetMsg(r.ok ? "Reset complete. Reloading…" : "Reset failed.");
      if (r.ok) setTimeout(() => (window.location.href = "/welcome"), 1200);
    } catch { setResetMsg("Reset failed."); }
    setResetting(false);
  }

  return (
    <OperatorShell active="">
      <OperatorHeader
        icon={Icon.bolt}
        label="Diagnostics · internal"
        provenance={<DataStateBadge state={state} />}
        title="Engine"
        accent="console."
        action={state === "real" ? (
          <div className="text-right">
            <button onClick={factoryReset} disabled={resetting} className="mg-btn mg-btn--ghost" style={{ fontSize: 12.5, color: "var(--signal-danger)", borderColor: "var(--signal-danger-soft)" }}>
              {resetting ? "Wiping everything…" : "Full reset — wipe everything"}
            </button>
            {resetMsg && <p className="text-[11px] mt-1" style={{ color: "var(--signal-live-ink)" }}>{resetMsg}</p>}
          </div>
        ) : null}
      />

      {state === "disconnected" ? (
        <EmptyState state="disconnected" icon={Icon.bolt} title="Sign in to see the engine" />
      ) : !d ? null : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Engines */}
          <Card className="p-5">
            <SectionHead title="System status" hint="What each engine has produced for this account" />
            <div className="mt-3 flex flex-col gap-1">
              {d.engines.map((e) => (
                <Row key={e.id} ok={e.ready} label={e.label}
                  right={e.count == null ? (e.ready ? "ready" : "—") : `${e.count.toLocaleString()}${e.unit ? ` ${e.unit}` : ""}`}
                  dim={e.count === 0} />
              ))}
            </div>
          </Card>

          {/* APIs */}
          <Card className="p-5">
            <SectionHead title="API status" hint="Configured = credentials present in this environment" />
            <div className="mt-3 flex flex-col gap-1">
              {d.apis.map((a) => (
                <Row key={a.id} ok={a.configured} label={a.label} right={a.configured ? "configured" : "missing"} danger={!a.configured} />
              ))}
            </div>
          </Card>

          {/* Activity */}
          <Card className="p-5 lg:col-span-2">
            <SectionHead title="Engine activity" hint="The most recent things Genie actually did" />
            {(d.activity || []).length === 0 ? (
              <p className="mt-3 text-[13px] mg-muted">No activity logged yet. Run a scan from <a href="/welcome" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>/welcome</a> and it will start streaming here.</p>
            ) : (
              <div className="mt-3 flex flex-col">
                {d.activity.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 py-2" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
                    <span className="mg-pill" style={{ minWidth: 92, justifyContent: "center", textTransform: "capitalize" }}>{a.verb || "event"}</span>
                    <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: "var(--fg)" }}>{a.message}{a.detail ? <span className="mg-subtle"> · {a.detail}</span> : null}</span>
                    <span className="text-[11.5px] mg-subtle mg-num shrink-0">{relTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {d?.generatedAt && <p className="mt-6 text-center text-[11.5px] mg-subtle">Snapshot at {new Date(d.generatedAt).toLocaleTimeString()} · reload to refresh</p>}
    </OperatorShell>
  );
}

function SectionHead({ title, hint }) {
  return (
    <div>
      <h2 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{title}</h2>
      <p className="text-[12px] mg-muted mt-0.5">{hint}</p>
    </div>
  );
}

function Row({ ok, label, right, danger, dim }) {
  return (
    <div className="flex items-center gap-3 py-2" style={{ borderTop: "1px solid var(--hair)" }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, flex: "none", background: ok ? "var(--signal-live)" : danger ? "var(--signal-danger)" : "var(--fg-subtle)" }} />
      <span className="text-[13.5px] flex-1" style={{ color: "var(--fg)" }}>{label}</span>
      <span className="text-[12px] mg-num" style={{ color: dim ? "var(--fg-subtle)" : danger ? "var(--signal-danger)" : "var(--fg-muted)" }}>{right}</span>
    </div>
  );
}
