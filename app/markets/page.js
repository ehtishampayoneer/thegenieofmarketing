"use client";

// ── MARKET EXPANSION ── a visual scoreboard of serve-able, low-competition countries + the
// experiments you launch. HONEST by design: Search Console numbers are Verified; the rest
// are Estimated projections (sales shown as an est. range with an assumed conversion);
// eligibility (language/delivery/payment/restrictions) is stored and gates markets out;
// English-only drafts are blocked for markets that need local-language content. Progress =
// SEARCH progress only — lead/revenue country attribution is the next phase (not claimed here).

import { useEffect, useMemo, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";

const DIFF = {
  Easy: { c: "var(--signal-live-ink)", bg: "var(--signal-live-soft)" },
  Medium: { c: "var(--signal-warn)", bg: "var(--signal-warn-soft)" },
  Hard: { c: "var(--signal-danger)", bg: "var(--signal-danger-soft)" },
};
const CONF = { verified: { c: "var(--signal-live-ink)", label: "Verified" }, estimated: { c: "var(--accent-ink)", label: "Estimated" }, insufficient: { c: "var(--fg-subtle)", label: "No data" } };
const DRAFT = { pending: { label: "Drafting…", c: "var(--fg-subtle)" }, drafted: { label: "Draft in Approvals", c: "var(--accent-ink)" }, published: { label: "Live", c: "var(--signal-live-ink)" } };
const BUCKETS = [{ id: "all", label: "All markets" }, { id: "emerging", label: "Already emerging" }, { id: "ready", label: "Ready to test" }];
const LANGS = [["en", "English"], ["es", "Spanish"], ["pt", "Portuguese"], ["de", "German"], ["fr", "French"], ["ar", "Arabic"], ["pl", "Polish"], ["tr", "Turkish"], ["it", "Italian"], ["nl", "Dutch"], ["id", "Indonesian"]];
const REGIONS = ["N. America", "Europe", "LatAm", "Asia", "Africa", "Middle East", "Oceania", "Caucasus"];
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n ?? 0));
const salesRange = (r) => (r.expSalesLow === r.expSalesHigh ? `${r.expSalesLow}` : `${fmt(r.expSalesLow)}–${fmt(r.expSalesHigh)}`);
const TASK_LABEL = { article: "Localized landing page", social_post: "Local intro post", outreach_email: "Local outreach email", seo_fix: "Copy-paste local-SEO snippet", distribution: "Local placement" };
const taskLabel = (t) => TASK_LABEL[t.kind] || t.title;

export default function MarketsPage() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [tab, setTab] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [targeting, setTargeting] = useState("");
  const [tgtErr, setTgtErr] = useState(null); // {code, msg}
  const [tgtDone, setTgtDone] = useState(null); // {code, tasksAdded, tasks, country, flag}
  const [editing, setEditing] = useState(false);
  const [sort, setSort] = useState({ key: "opp", dir: "desc" });
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "difficulty" ? "asc" : "desc" }));

  async function load() {
    try {
      const j = await fetch(`/api/markets`, { cache: "no-store" }).then((x) => x.json());
      if (!j.ok) { setState(j.reason === "not_authenticated" ? "auth" : "error"); return; }
      setData(j); setState("done");
    } catch { setState("error"); }
  }
  useEffect(() => { load(); }, []);

  const expByCode = useMemo(() => { const m = {}; (data?.experiments || []).forEach((e) => (m[e.code] = e)); return m; }, [data]);
  const rows = useMemo(() => {
    if (!data?.rows) return [];
    let list = data.rows.filter((r) => r.eligible);
    if (tab !== "all") list = list.filter((r) => r.bucket === tab);
    const diffRank = { Easy: 1, Medium: 2, Hard: 3 };
    const val = (r) => sort.key === "difficulty" ? diffRank[r.difficulty] : sort.key === "traffic" ? r.expTraffic : sort.key === "sales" ? r.expSalesHigh : sort.key === "progress" ? (expByCode[r.code]?.progress ?? r.progress) : r.opp;
    return [...list].sort((a, b) => { const d = (val(a) || 0) - (val(b) || 0); return sort.dir === "asc" ? d : -d; });
  }, [data, tab, sort, expByCode]);
  const emergingCount = (data?.rows || []).filter((r) => r.bucket === "emerging").length;

  async function saveProfile(profile) {
    setState("loading"); setEditing(false);
    try { await fetch("/api/markets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "profile", profile }) }); } catch {}
    await load();
  }
  async function target(code) {
    if (targeting) return;
    setTargeting(code); setTgtErr(null); setTgtDone(null);
    try {
      const j = await fetch("/api/markets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then((r) => r.json());
      if (!j.ok) { setTgtErr({ code, msg: j.error || "Couldn't start that experiment." }); setTargeting(""); return; }
      setTgtDone({ code, tasksAdded: j.tasksAdded || 0, tasks: j.tasks || [], country: j.country, flag: j.flag });
      await load(); // keep the row open so the result summary shows
    } catch { setTgtErr({ code, msg: "Couldn't start that experiment. Try again." }); }
    setTargeting("");
  }
  // Add the market's local language to eligibility, then immediately target it — one tap.
  async function addLangAndTarget(code, lang) {
    if (targeting || !data?.profile) return;
    setTargeting(code); setTgtErr(null); setTgtDone(null);
    try {
      const langs = Array.from(new Set([...(data.profile.languages || ["en"]), lang]));
      await fetch("/api/markets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "profile", profile: { ...data.profile, languages: langs } }) });
      const j = await fetch("/api/markets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then((r) => r.json());
      if (!j.ok) { setTgtErr({ code, msg: j.error || "Couldn't start that experiment." }); setTargeting(""); await load(); return; }
      setTgtDone({ code, tasksAdded: j.tasksAdded || 0, tasks: j.tasks || [], country: j.country, flag: j.flag });
      await load();
    } catch { setTgtErr({ code, msg: "Couldn't add that language. Try again." }); }
    setTargeting("");
  }
  async function stop(id) {
    if (!window.confirm("Stop this market experiment? Any draft it created stays in Approvals.")) return;
    try { await fetch("/api/markets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", id }) }); await load(); } catch {}
  }

  return (
    <OperatorShell active="markets">
      <OperatorHeader icon={Icon.globe} label="Market Testing" title="Test your next" accent="markets."
        kicker="Countries you can actually serve where demand is real and competition is thin. Genie ranks them, drafts a localized page to test each one, and tracks the search results — so you validate a market before you commit to it." />

      {/* honesty note */}
      <Card className="p-4 mt-5">
        <p className="text-[13px] flex items-start gap-2" style={{ color: "var(--fg-muted)" }}>
          <Icon.info size={14} style={{ color: "var(--accent-ink)", marginTop: 2, flexShrink: 0 }} />
          <span><b style={{ color: "var(--fg)" }}>Verified</b> = from your Search Console. <b style={{ color: "var(--fg)" }}>Estimated</b> = market-model projections (sales are a range at an assumed conversion) — direction, not promises. Progress tracks <b style={{ color: "var(--fg)" }}>search visibility</b> only; lead & revenue by country is the next phase.{data && !data.hasGsc && " Connect Search Console to verify countries you already reach."}</span>
        </p>
      </Card>

      {/* eligibility (stored, hard gates) */}
      {state === "done" && data?.profile && (
        <EligibilityCard profile={data.profile} editing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSave={saveProfile} />
      )}

      {state === "loading" && <div className="mt-5 mg-surface p-10 text-center text-[13px] mg-subtle">Finding your best markets…</div>}
      {state === "auth" && <div className="mt-5 mg-surface p-10 text-center text-[13px] mg-subtle">Sign in to see your market expansion opportunities.</div>}
      {state === "error" && <div className="mt-5 mg-surface p-10 text-center text-[13px] mg-subtle">Couldn't load markets just now. Try again in a moment.</div>}

      {state === "done" && data?.localOnly && (
        <Card className="mt-5 p-6 flex items-start gap-3">
          <span className="mg-tile shrink-0" style={{ width: 40, height: 40, background: "var(--signal-warn-soft)", color: "var(--signal-warn)" }}><Icon.globe size={19} /></span>
          <div>
            <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Your delivery is set to “only my area”</p>
            <p className="text-[13px] mt-1" style={{ color: "var(--fg-muted)", maxWidth: "var(--measure)" }}>Expanding into other countries only pays off if you can serve them. If you can sell remotely or ship, change delivery above and Genie will find your best markets.</p>
          </div>
        </Card>
      )}

      {state === "done" && !data?.localOnly && (
        <div className="mt-5 flex flex-col gap-6">
          {data.experiments?.length > 0 && (
            <div>
              <p className="mg-klabel mb-3">Active experiments · {data.experiments.length}</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {data.experiments.map((e) => <ExperimentCard key={e.id} e={e} onStop={() => stop(e.id)} />)}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {BUCKETS.map((b) => (
                <button key={b.id} onClick={() => setTab(b.id)} className="mg-focus" style={{ fontSize: 13, fontWeight: 600, padding: ".4rem .8rem", borderRadius: 999, cursor: "pointer", border: `1px solid ${tab === b.id ? "var(--accent)" : "var(--hair)"}`, background: tab === b.id ? "var(--accent-quiet)" : "var(--surface)", color: tab === b.id ? "var(--accent-ink)" : "var(--fg-muted)" }}>
                  {b.label}{b.id === "emerging" && emergingCount > 0 ? ` · ${emergingCount}` : ""}
                </button>
              ))}
            </div>
            {/* mobile sort control */}
            <div className="lg:hidden flex items-center gap-1.5 mb-3 overflow-x-auto thin-scroll">
              <span className="text-[11px] mg-subtle shrink-0">Sort:</span>
              {[["opp", "Best"], ["difficulty", "Difficulty"], ["traffic", "Traffic"], ["sales", "Sales"], ["progress", "Progress"]].map(([k, l]) => (
                <button key={k} onClick={() => toggleSort(k)} className="shrink-0 mg-focus" style={{ ...chip(sort.key === k), fontSize: 12, padding: ".3rem .55rem" }}>{l}{arrow(sort, k)}</button>
              ))}
            </div>
            {/* desktop sortable header */}
            <div className="hidden lg:grid px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ gridTemplateColumns: "2.4fr 1fr 1fr 1fr 1.4fr", gap: 16, color: "var(--fg-subtle)" }}>
              <span>Country</span>
              <button onClick={() => toggleSort("difficulty")} className="mg-focus text-left" style={hbtn(sort.key === "difficulty")}>Difficulty{arrow(sort, "difficulty")}</button>
              <button onClick={() => toggleSort("traffic")} className="mg-focus text-right" style={hbtn(sort.key === "traffic")}>Search traffic/mo{arrow(sort, "traffic")}</button>
              <button onClick={() => toggleSort("sales")} className="mg-focus text-right" style={hbtn(sort.key === "sales")}>Sales/mo · est.{arrow(sort, "sales")}</button>
              <button onClick={() => toggleSort("progress")} className="mg-focus text-left" style={hbtn(sort.key === "progress")}>Time · progress{arrow(sort, "progress")}</button>
            </div>
            <div className="flex flex-col gap-2.5">
              {rows.map((r) => <MarketRow key={r.code} r={r} exp={expByCode[r.code]} open={openId === r.code} onToggle={() => setOpenId(openId === r.code ? null : r.code)} onTarget={() => target(r.code)} onAddLang={() => addLangAndTarget(r.code, r.lang)} targeting={targeting === r.code} err={tgtErr?.code === r.code ? tgtErr.msg : ""} done={tgtDone?.code === r.code ? tgtDone : null} />)}
              {rows.length === 0 && <p className="text-[13px] mg-subtle text-center py-8">No eligible markets in this view. Widen your delivery or languages above.</p>}
            </div>
          </div>
        </div>
      )}
    </OperatorShell>
  );
}

function EligibilityCard({ profile, editing, onEdit, onCancel, onSave }) {
  const [delivery, setDelivery] = useState(profile.delivery || "anywhere");
  const [languages, setLanguages] = useState(profile.languages || ["en"]);
  const [regions, setRegions] = useState(profile.regions || []);
  const [englishConfirmed, setEnglishConfirmed] = useState(!!profile.englishConfirmed);
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const langNames = (profile.languages || ["en"]).map((c) => (LANGS.find((l) => l[0] === c)?.[1] || c)).join(", ");
  const deliveryLabel = { anywhere: "customers anywhere", regions: `regions: ${(profile.regions || []).join(", ") || "none set"}`, local: "only my area" }[profile.delivery || "anywhere"];

  if (!editing) return (
    <Card className="p-4 mt-4 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
        <b style={{ color: "var(--fg)" }}>Eligibility</b> · Serve: {deliveryLabel} · Content languages: {langNames}
      </p>
      <button onClick={onEdit} className="mg-btn mg-btn--ghost shrink-0" style={{ fontSize: 12 }}>Edit</button>
    </Card>
  );
  return (
    <Card className="p-5 mt-4">
      <p className="mg-klabel mb-3">Your eligibility · hard gates</p>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[13px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>I can serve / deliver to</p>
          <div className="flex gap-2 flex-wrap">
            {[["anywhere", "Customers anywhere"], ["regions", "Certain regions"], ["local", "Only my area"]].map(([v, l]) => (
              <button key={v} onClick={() => setDelivery(v)} className="mg-focus" style={chip(delivery === v)}>{l}</button>
            ))}
          </div>
        </div>
        {delivery === "regions" && (
          <div>
            <p className="text-[13px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>Which regions</p>
            <div className="flex gap-2 flex-wrap">{REGIONS.map((r) => <button key={r} onClick={() => toggle(regions, setRegions, r)} className="mg-focus" style={chip(regions.includes(r))}>{r}</button>)}</div>
          </div>
        )}
        <div>
          <p className="text-[13px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>Languages I can produce content in</p>
          <div className="flex gap-2 flex-wrap">{LANGS.map(([c, l]) => <button key={c} onClick={() => toggle(languages, setLanguages, c)} className="mg-focus" style={chip(languages.includes(c))}>{l}</button>)}</div>
          <p className="text-[12px] mt-1.5" style={{ color: "var(--fg-subtle)" }}>Markets that need a language you don't produce won't be auto-drafted in English (that would be thin content).</p>
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={englishConfirmed} onChange={(e) => setEnglishConfirmed(e.target.checked)} style={{ marginTop: 3, accentColor: "var(--accent)", width: 15, height: 15 }} />
          <span className="text-[13px]" style={{ color: "var(--fg)" }}>I'm comfortable selling in <b>English</b> to non-native-English markets <span className="mg-subtle">— lets Genie test high-English countries (Germany, Netherlands…) without local-language content. Off by default.</span></span>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={() => onSave({ ...profile, delivery, languages: languages.length ? languages : ["en"], regions, englishConfirmed })} className="mg-btn mg-btn--dawn" style={{ fontSize: 13 }}>Save eligibility</button>
        <button onClick={onCancel} className="mg-btn mg-btn--quiet" style={{ fontSize: 13 }}>Cancel</button>
      </div>
    </Card>
  );
}
const chip = (on) => ({ fontSize: 13, fontWeight: 600, padding: ".38rem .7rem", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`, background: on ? "var(--accent-quiet)" : "var(--surface)", color: on ? "var(--accent-ink)" : "var(--fg-muted)" });
const arrow = (sort, key) => (sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "");
const hbtn = (active) => ({ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: active ? "var(--accent-ink)" : "var(--fg-subtle)" });

function ExperimentCard({ e, onStop }) {
  const ds = DRAFT[e.draftStatus] || DRAFT.pending;
  const t = e.searchTraction;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>{e.flag}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold leading-tight" style={{ color: "var(--fg)" }}>{e.name}</p>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-subtle)" }}>{e.goal}</p>
        </div>
        <button onClick={onStop} className="mg-btn mg-btn--quiet shrink-0" style={{ fontSize: 12 }}>Stop</button>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[12px] mb-1">
          <span style={{ color: "var(--fg-muted)" }}>Search progress</span>
          <span className="mg-num" style={{ color: "var(--signal-live-ink)" }}>{e.progress}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(4, e.progress)}%`, background: "linear-gradient(90deg, var(--accent), var(--signal-live))", transition: "width .6s" }} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap text-[12px]">
        <span className="inline-flex items-center gap-1.5" style={{ color: ds.c }}><Icon.write size={13} /> {ds.label}</span>
        {t ? <span className="inline-flex items-center gap-1.5 mg-num" style={{ color: "var(--fg-muted)" }}><Icon.search size={13} /> {t.impressions} impr · {t.clicks} clicks</span> : <span className="mg-num" style={{ color: "var(--fg-subtle)" }}>No search data yet</span>}
      </div>
      <p className="text-[12px] mt-2" style={{ color: "var(--fg-subtle)" }}>Outcome: awaiting results — lead/revenue tracking by country comes next, then a Scale / Refine / Pause call.</p>
      {(e.taskCount > 0 || e.draftStatus !== "pending") && <a href="/approvals" className="mt-2.5 inline-flex text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>Review {e.taskCount > 0 ? `${e.taskCount} ${e.name} ${e.taskCount === 1 ? "task" : "tasks"}` : "the draft"} in Approvals →</a>}
    </Card>
  );
}

function MarketRow({ r, exp, open, onToggle, onTarget, onAddLang, targeting, err, done }) {
  const d = DIFF[r.difficulty] || DIFF.Medium;
  const conf = CONF[r.confidence] || CONF.estimated;
  return (
    <Card className="p-0 overflow-hidden mg-lift">
      <button onClick={onToggle} className="w-full text-left mg-focus" style={{ background: "none", border: "none", cursor: "pointer" }}>
        <div className="px-4 py-3.5">
          <div className="lg:grid lg:items-center" style={{ gridTemplateColumns: "2.4fr 1fr 1fr 1fr 1.4fr", gap: 16 }}>
            <div className="flex items-center gap-3 min-w-0">
              <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>{r.flag}</span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-tight flex items-center gap-2" style={{ color: "var(--fg)" }}>
                  {r.name}
                  <span title={conf.label} style={{ width: 7, height: 7, borderRadius: 999, background: conf.c, flexShrink: 0 }} />
                  {exp && <span className="text-[11px] font-bold uppercase tracking-wide" style={{ padding: ".12rem .4rem", borderRadius: 5, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}>Active</span>}
                  {!exp && r.needsLocalLang && <span className="text-[11px] font-bold uppercase tracking-wide" style={{ padding: ".12rem .4rem", borderRadius: 5, background: "var(--signal-warn-soft)", color: "var(--signal-warn)" }}>Needs {r.langName}</span>}
                  {!exp && r.englishTest && <span className="text-[11px] font-bold uppercase tracking-wide" style={{ padding: ".12rem .4rem", borderRadius: 5, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}>English test</span>}
                </p>
                <p className="text-[12px] leading-tight mt-0.5 truncate" style={{ color: "var(--fg-subtle)" }}>{r.region}{r.why[0] ? ` · ${r.why[0]}` : ""}</p>
              </div>
            </div>
            <div className="mt-2 lg:mt-0"><span className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ padding: ".3rem .6rem", borderRadius: 8, background: d.bg, color: d.c }}>{r.difficulty}</span></div>
            <div className="hidden lg:flex flex-col items-end"><span className="mg-num text-[16px] font-bold" style={{ color: "var(--fg)" }}>{fmt(r.expTraffic)}</span><span className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>est. visitors</span></div>
            <div className="hidden lg:flex flex-col items-end" title={`assumes ~${r.assumedConvPct}% visitor→sale`}><span className="mg-num text-[16px] font-bold" style={{ color: "var(--accent-ink)" }}>{salesRange(r)}</span><span className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>est. sales</span></div>
            <div className="mt-2.5 lg:mt-0">
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="mg-num" style={{ color: "var(--fg-muted)" }}>~{r.days} days</span>
                <span className="mg-num" style={{ color: (exp?.progress ?? r.progress) > 0 ? "var(--signal-live-ink)" : "var(--fg-subtle)" }}>{exp?.progress ?? r.progress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, exp?.progress ?? r.progress)}%`, background: "linear-gradient(90deg, var(--accent), var(--signal-live))", transition: "width .6s" }} />
              </div>
            </div>
          </div>
          <div className="lg:hidden flex items-center gap-4 mt-2">
            <MiniStat icon={Icon.search} v={fmt(r.expTraffic)} l="est. visitors/mo" />
            <MiniStat icon={Icon.coins} v={salesRange(r)} l="est. sales/mo" accent />
          </div>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1" style={{ borderTop: "1px solid var(--hair)" }}>
          <div className="flex flex-wrap gap-2 mt-3">
            {r.why.map((w, i) => <span key={i} className="text-[12px] font-medium" style={{ padding: ".3rem .6rem", borderRadius: 8, background: "var(--surface-2)", color: "var(--fg-muted)" }}>{w}</span>)}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fact l="Opportunity" v={`${r.opp}/100`} /><Fact l="Competition gap" v={`${r.gap}/100`} /><Fact l="Business fit" v={`${r.fit}/100`} /><Fact l="Confidence" v={CONF[r.confidence].label} />
          </div>
          <p className="text-[13px] mt-3.5" style={{ color: "var(--fg-subtle)" }}>
            <b style={{ color: "var(--fg-muted)" }}>Scenario, not a forecast:</b> at ~{fmt(r.expTraffic)} monthly visitors and a ~{r.assumedConvPct}% conversion, outcomes may be <b style={{ color: "var(--fg-muted)" }}>{salesRange(r)} sales/mo</b>. Your real numbers will differ — that's what the test is for.
          </p>
          {/* what Genie will actually do for this country — shown before you target */}
          {!exp && (
            <div className="mt-3.5 rounded-xl p-3.5" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
              <p className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>When you target {r.name}, Genie adds a country-specific kit to Approvals:</p>
              <ul className="mt-2 space-y-1.5">
                {[`Localized landing page${r.supportsLang && r.lang !== "en" ? ` in ${r.langName}` : ""}`, "A local intro post you can share", "A local outreach email (draft-and-you-send)", "A copy-paste local-SEO snippet for your own site", "A few local placements to get seen faster"].map((t, i) => (
                  <li key={i} className="text-[13px] flex items-start gap-2" style={{ color: "var(--fg-muted)" }}><span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--accent)", marginTop: 6, flexShrink: 0 }} /> {t}</li>
                ))}
              </ul>
              <p className="text-[12px] mt-2.5" style={{ color: "var(--fg-subtle)" }}>All tagged <b style={{ color: "var(--fg-muted)" }}>{r.name}</b> and grouped on their own tab in Approvals. Your everyday global marketing keeps running — this is an extra, country-specific track.</p>
            </div>
          )}
          {exp ? (
            <div className="mt-3.5">
              <p className="text-[13px] font-semibold" style={{ color: "var(--signal-live-ink)" }}>✓ Market test running — see “Active experiments” above.</p>
              {done && (
                <div className="mt-2.5 rounded-xl p-3.5" style={{ background: "var(--signal-live-soft)", border: "1px solid var(--hair)" }}>
                  <p className="text-[13px] font-bold" style={{ color: "var(--signal-live-ink)" }}>{done.tasksAdded > 0 ? `Added ${done.tasksAdded} ${done.country}-specific ${done.tasksAdded === 1 ? "task" : "tasks"} to Approvals` : `${done.country} test started`}</p>
                  {done.tasks?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {done.tasks.map((t, i) => <li key={i} className="text-[12px] flex items-start gap-2" style={{ color: "var(--fg-muted)" }}><span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--signal-live-ink)", marginTop: 6, flexShrink: 0 }} /> {taskLabel(t)}</li>)}
                    </ul>
                  )}
                  <a href="/approvals" className="mt-2.5 inline-flex text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>Review the {done.country} tab in Approvals →</a>
                </div>
              )}
            </div>
          ) : r.needsLocalLang ? (
            <div className="mt-3.5">
              <p className="text-[13px]" style={{ color: "var(--signal-warn)" }}>Needs <b>{r.langName}</b> to reach the mainstream — an English-only page would be thin.</p>
              <button onClick={onAddLang} disabled={targeting} className="mg-btn mg-btn--dawn mt-2.5 inline-flex disabled:opacity-60" style={{ fontSize: 14 }}>
                {targeting ? <>Adding {r.langName} &amp; building your {r.name} kit… <span className="mg-thinking"><i /><i /><i /></span></> : <><Icon.plus size={15} /> Add {r.langName} &amp; target {r.name} →</>}
              </button>
              <p className="text-[12px] mt-1.5" style={{ color: "var(--fg-subtle)" }}>Adds {r.langName} to your content languages, then drafts the whole kit in {r.langName}.</p>
              {err && <p className="mt-2 text-[13px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}
            </div>
          ) : r.englishTest ? (
            <p className="mt-3 text-[13px]" style={{ color: "var(--accent-ink)" }}>This is an <b>English-test market</b> — English isn't {r.name}'s first language. Turn on “I'm comfortable selling in English…” in Eligibility to test it, or target a market where you already get English search traffic.</p>
          ) : (
            <>
              <button onClick={onTarget} disabled={targeting} className="mg-btn mg-btn--dawn mt-3 inline-flex disabled:opacity-60" style={{ fontSize: 14 }}>
                {targeting ? <>Building your {r.name} kit… <span className="mg-thinking"><i /><i /><i /></span></> : <><Icon.target size={15} /> Target this market — build the kit →</>}
              </button>
              {err && <p className="mt-2 text-[13px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function MiniStat({ icon: I, v, l, accent }) {
  return (<span className="inline-flex items-center gap-1.5"><I size={14} style={{ color: accent ? "var(--accent-ink)" : "var(--fg-subtle)" }} /><span className="mg-num text-[14px] font-bold" style={{ color: accent ? "var(--accent-ink)" : "var(--fg)" }}>{v}</span><span className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>{l}</span></span>);
}
function Fact({ l, v }) { return (<div><p className="text-[11px] mg-subtle">{l}</p><p className="text-[14px] font-bold mg-num" style={{ color: "var(--fg)" }}>{v}</p></div>); }
