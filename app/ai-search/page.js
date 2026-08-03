"use client";

// ── AI SEARCH VISIBILITY (Operator surface, live) ──
// Reads stored AI-search gaps (from the Decision Ledger) via /api/ai-search and
// falls back to representative data for the preview. Each gap is an explainable
// OpportunityCard: discovered · why · recommendation · if approved · outcome.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Provenance } from "@/components/ui/v2/primitives";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import { OpportunityCard } from "@/components/ui/v2/OpportunityCard";
import { DataStateBadge, EmptyState } from "@/components/ui/v2/DataState";
import { useLive } from "@/lib/useLive";

export default function AiSearchPage() {
  const { data: d, state } = useLive("/api/ai-search", (j) => !(j.opportunities?.length));
  const pct = d?.score ?? 0;
  const [msg, setMsg] = useState("");
  const [writing, setWriting] = useState("");
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 6000); return () => clearTimeout(t); }, [msg]);

  // Turn a gap into real, approvable content: Genie writes the AEO answer page and
  // it lands in the Approvals queue. (This button used to do nothing.)
  async function writeGap(o, i) {
    if (writing) return;
    setWriting(String(i));
    setMsg("Genie is writing this — it’ll appear in Approvals in ~30 seconds.");
    try {
      const r = await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: o.recommendation || o.discovered }) }).then((x) => x.json());
      setMsg(r?.ok ? "Done — it’s waiting for your approval in Approvals." : "Couldn’t start that one — try again in a moment.");
    } catch { setMsg("Couldn’t start that one — try again in a moment."); }
    setWriting("");
  }

  const [checking, setChecking] = useState(false);
  // Run the AI-search check on the EXISTING business (no re-scan). This is what
  // the empty state should do instead of sending the user back to onboarding.
  async function checkNow() {
    if (checking) return;
    setChecking(true);
    try {
      const t = await fetch("/api/today", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const h = t?.entity?.host;
      if (h) await fetch("/api/ai-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: h }) });
    } catch {}
    window.location.reload();
  }

  return (
    <OperatorShell active="aisearch">
      <OperatorHeader
        icon={Icon.spark}
        label="AI Search Visibility"
        provenance={<DataStateBadge state={state} />}
        title={<>Buyers are asking AI about you.<br /><span className="dawn-text">Right now, it’s recommending competitors instead.</span></>}
      />

      {state === "disconnected" ? (
        <EmptyState state="disconnected" icon={Icon.spark} />
      ) : state !== "real" ? (
        <Card className="mt-6 p-12 text-center">
          <div className="inline-flex mb-3" style={{ color: "var(--accent-ink)" }}><Icon.spark size={38} /></div>
          <p className="text-[18px] font-bold" style={{ color: "var(--fg)" }}>I haven’t checked AI search yet</p>
          <p className="mt-1.5 text-[14px] mg-muted max-w-md mx-auto">I model what ChatGPT, Perplexity, and Google’s AI recommend for your buyers, then find the gaps where they cite competitors instead of you. It runs right after your scan and takes about 30 seconds.</p>
          <button onClick={checkNow} disabled={checking} className="mg-btn mg-btn--dawn inline-flex mt-5 disabled:opacity-60">{checking ? "Checking AI search…" : "Check AI search now →"}</button>
        </Card>
      ) : (
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        <Card className="p-5 self-start">
          <div className="flex items-baseline gap-2">
            <span className="text-[44px] font-bold leading-none mg-num" style={{ color: "var(--fg)" }}>{pct}%</span>
            <span className="mg-estimated">AI-modelled</span>
          </div>
          <p className="mt-1 text-[13px] mg-muted">You’re cited in <span className="font-semibold" style={{ color: "var(--fg)" }}>{pct}%</span> of the buyer questions your customers ask AI.</p>
          <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-full rounded-full dawn-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--hair)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mg-subtle mb-2">AI recommends instead</p>
            <div className="flex flex-wrap gap-1.5">{d.competitors.map((c) => <span key={c} className="mg-pill mg-pill--danger">{c}</span>)}</div>
            <p className="mt-3 text-[12px] mg-muted">Approve the plays on the right and Genie closes these gaps — each becomes a piece of AI-citable content.</p>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Gaps to win</h2>
            <span className="mg-pill mg-pill--dawn">{d.opportunities.length} ready</span>
            <span className="ml-auto text-[12px] mg-subtle">ranked by buyer intent</span>
          </div>
          {d.opportunities.map((o, i) => <OpportunityCard key={i} {...o} primaryLabel={writing === String(i) ? "Writing…" : "Approve & write it"} onApprove={() => writeGap(o, i)} />)}
        </div>
      </div>
      )}

      {state === "real" && <CitationGap />}

      <p className="mt-8 mb-2 text-center text-[13px] mg-subtle">Genie re-checks AI search as your content publishes — and learns which plays win citations for you.</p>

      {msg && (
        <div className="fixed left-1/2 z-50" style={{ bottom: 24, transform: "translateX(-50%)" }}>
          <div className="mg-surface px-4 py-2.5 text-[13px] mg-rise" style={{ boxShadow: "var(--shadow-3)", color: "var(--fg)", borderColor: "var(--border-strong)", maxWidth: "90vw" }}>{msg}</div>
        </div>
      )}
    </OperatorShell>
  );
}

// ── THE CITATION GAP ──
// AI almost never cites a vendor's own site when recommending; it cites buying
// guides, roundups and review platforms. So the lists you're MISSING from are the
// real opportunity — get in there and the AI starts naming you.
const KIND_LABEL = { listicle: "Buying guide", review: "Review platform", community: "Community", directory: "Directory", news: "Press", unknown: "Other" };

function CitationGap() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/citations", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j?.ok) setD(j); }).catch(() => {});
  }, []);

  async function run() {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const j = await fetch("/api/citations", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json());
      if (j?.ok) setD(j);
      else setErr(j?.message || "Couldn’t check the lists just then. Try again.");
    } catch { setErr("Something interrupted that. Try again."); }
    setBusy(false);
  }

  const s = d?.summary;
  const gaps = (d?.targets || []).filter((t) => t.mentioned === false);

  return (
    <section className="mg-act mt-8">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>The lists AI reads</h2>
        {s?.gaps > 0 && <span className="mg-pill mg-pill--danger">missing from {s.gaps}</span>}
        <button onClick={run} disabled={busy} className="ml-auto text-[12.5px] font-semibold mg-focus disabled:opacity-50" style={{ color: "var(--accent-ink)" }}>
          {busy ? "Checking the lists…" : d ? "↻ Re-check" : "Check now →"}
        </button>
      </div>
      <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: 720 }}>
        When buyers ask AI for a recommendation, it quotes other people’s buying guides and review sites, not your website. These are the pages it draws from for your buyers — getting listed on them is how you get named.
      </p>

      {err && <p className="mt-2 text-[12.5px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}

      {s && (
        <div className="mg-statstrip mt-3">
          <StatBox value={s.checked} label="Pages AI cites" />
          <StatBox value={s.gaps} label="You’re missing from" accent />
          <StatBox value={s.alreadyIn} label="Already listed in" />
          <StatBox value={s.actionable} label="Worth pitching" accent />
        </div>
      )}

      {s?.topRivals?.length > 0 && (
        <p className="mt-2 text-[12.5px] mg-muted">
          Taking your slot most often: {s.topRivals.map((r) => `${r.name} (${r.count})`).join(" · ")}
        </p>
      )}

      {gaps.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {gaps.slice(0, 10).map((t) => (
            <div key={t.id || t.url} className="mg-surface-quiet p-3.5 flex items-start gap-3">
              <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: "var(--accent-quiet)", color: "var(--accent-ink)" }}>
                {KIND_LABEL[t.kind] || "Other"}
              </span>
              <div className="flex-1 min-w-0">
                <a href={t.url} target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold mg-focus block truncate" style={{ color: "var(--fg)" }}>
                  {t.title || t.domain}
                </a>
                <p className="text-[11.5px] mg-subtle mt-0.5 truncate">
                  {t.domain}
                  {t.question ? ` · cited when buyers ask “${t.question}”` : ""}
                </p>
                {t.competitors_found?.length > 0 && (
                  <p className="text-[11.5px] mt-0.5" style={{ color: "var(--signal-warn)" }}>Lists {t.competitors_found.join(", ")} — not you</p>
                )}
              </div>
              {t.pay_to_play && <span className="text-[10.5px] shrink-0 mg-subtle" title="Sponsored or affiliate placement — needs payment, not a pitch">paid</span>}
            </div>
          ))}
        </div>
      )}

      {d && s?.checked === 0 && !busy && (
        <p className="mt-3 text-[13px] mg-muted">Nothing checked yet. Run the AI-search check above first — that’s what finds the pages AI cites.</p>
      )}
      {gaps.length > 0 && (
        <p className="mt-3 text-[12px] mg-subtle">Next: Genie drafts a pitch for each of these and puts it in Approvals — you decide what gets sent. Nothing goes out without you.</p>
      )}
    </section>
  );
}

function StatBox({ value, label, accent }) {
  return (
    <div className="mg-statcell">
      <p className="mg-stat-num" style={accent ? { color: "var(--accent-ink)" } : undefined}>{value}</p>
      <p className="mg-stat-label">{label}</p>
    </div>
  );
}
