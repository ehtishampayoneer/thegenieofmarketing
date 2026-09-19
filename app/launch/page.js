"use client";

// app/launch/page.js
// ── LAUNCH LIST ──
// The places worth being listed on, sorted for this business: launch days,
// review and "alternatives" sites (what buyers and AI assistants quote), AI
// directories, local listings and founder communities. Genie writes the copy
// once; the owner presses Copy & open, pastes, and ticks it off. A few a day,
// best first, because launching everywhere in one afternoon wastes the launches
// that matter and looks like spam to the sites.

import { useEffect, useMemo, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import { Card } from "@/components/ui/v2/primitives";
import { KIND_LABEL, copyFor } from "@/lib/launch-places";

const TIER = { 1: "Go here first", 2: "Worth it", 3: "Quick extra" };
const btn = { fontSize: 12.5, padding: ".45rem .8rem" };

export default function LaunchPage() {
  const [d, setD] = useState(null);
  const [all, setAll] = useState(false);
  const [kitBusy, setKitBusy] = useState(false);
  const [kitErr, setKitErr] = useState("");
  const [showKit, setShowKit] = useState(false);

  async function load(showAll = all) {
    try {
      const j = await fetch(`/api/launch${showAll ? "?all=1" : ""}`, { cache: "no-store" }).then((r) => r.json());
      setD(j?.ok ? j : { error: true });
    } catch { setD({ error: true }); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function writeKit(fresh = false) {
    setKitBusy(true); setKitErr("");
    try {
      const j = await fetch("/api/launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fresh }) }).then((r) => r.json());
      if (j?.ok) { setD((x) => ({ ...x, kit: j.kit })); setShowKit(true); } else setKitErr(j?.error || "Couldn't write it just now.");
    } catch { setKitErr("Couldn't write it just now."); }
    setKitBusy(false);
  }

  async function mark(placeId, state, url) {
    const j = await fetch("/api/launch", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placeId, state, url }) }).then((r) => r.json()).catch(() => null);
    await load();
    return j;
  }

  const groups = useMemo(() => {
    const g = {};
    for (const p of d?.places || []) (g[p.kind] ||= []).push(p);
    return g;
  }, [d]);
  const today = new Set(d?.today || []);

  return (
    <OperatorShell active="launch">
      <div>
        <h1 className="mg-display" style={{ fontSize: "clamp(28px,3vw,37px)" }}>Launch list</h1>
        <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "var(--measure-wide)" }}>
          The places worth being listed on, picked for your business. <b style={{ color: "var(--fg)" }}>Review and comparison sites</b> matter most over time: buyers check them and AI assistants quote them. <b style={{ color: "var(--fg)" }}>Launch days</b> bring a burst of visitors. Genie writes everything; you press Copy &amp; open, paste, and tick it off.
        </p>
        <p className="mt-1.5 text-[12.5px] mg-subtle" style={{ maxWidth: "var(--measure-wide)" }}>
          Genie can&apos;t submit these for you: nearly all need your own account and block bots. Do a few a day, not all at once.
        </p>
      </div>

      {!d ? (
        <div className="mt-6 mg-surface p-10 text-center text-[13px] mg-subtle">Loading…</div>
      ) : d.error ? (
        <div className="mt-6 mg-surface p-10 text-center text-[13px] mg-subtle">Couldn&apos;t load the list. Refresh to try again.</div>
      ) : d.state === "no_site" ? (
        <div className="mt-6 mg-surface p-10 text-center text-[13px] mg-subtle">Scan your website first, so Genie knows which places suit you.</div>
      ) : (
        <>
          {/* The launch kit: written once, pasted everywhere. */}
          <Card className="mt-5 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Your launch kit</p>
                <p className="text-[12.5px] mg-muted mt-0.5">
                  {d.kit ? <>“{d.kit.tagline}”</> : "Tagline, descriptions, categories, a maker comment, a Show HN title and a Reddit post, written once for every place below."}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {d.kit && <button onClick={() => setShowKit((v) => !v)} className="mg-btn mg-btn--ghost" style={btn}>{showKit ? "Hide" : "Read it"}</button>}
                <button onClick={() => writeKit(!!d.kit)} disabled={kitBusy} className={`mg-btn ${d.kit ? "mg-btn--ghost" : "mg-btn--dawn"} disabled:opacity-60`} style={btn}>
                  {kitBusy ? "Writing…" : d.kit ? "Rewrite" : "Write my launch kit"}
                </button>
              </div>
            </div>
            {kitErr && <p className="mt-2 text-[12.5px]" style={{ color: "var(--signal-danger)" }}>{kitErr}</p>}
            {showKit && d.kit && <KitView kit={d.kit} />}
          </Card>

          <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[13.5px]" style={{ color: "var(--fg)" }}>
              <b>{d.done}</b> of {d.total} places done
              <span className="mg-subtle"> · picked for: {d.fits.filter((f) => f !== "startup").join(", ") || "new businesses"}</span>
            </p>
            <label className="text-[12.5px] mg-muted flex items-center gap-2" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); load(e.target.checked); }} />
              Show places that don&apos;t fit too
            </label>
          </div>

          {today.size > 0 && (
            <>
              <h2 className="mt-5 text-[16px] font-bold" style={{ color: "var(--fg)" }}>Today&apos;s five</h2>
              <p className="text-[12.5px] mg-muted">The best places you haven&apos;t done yet.</p>
              <div className="mt-2.5 flex flex-col gap-2.5">
                {(d.places || []).filter((p) => today.has(p.id)).map((p) => <PlaceRow key={p.id} p={p} kit={d.kit} host={d.host} onMark={mark} />)}
              </div>
            </>
          )}

          {Object.keys(KIND_LABEL).filter((k) => groups[k]?.length).map((k) => (
            <div key={k} className="mt-7">
              <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>{KIND_LABEL[k]} <span className="mg-subtle text-[13px] font-normal">· {groups[k].length}</span></h2>
              <div className="mt-2.5 flex flex-col gap-2.5">
                {groups[k].filter((p) => !today.has(p.id)).map((p) => <PlaceRow key={p.id} p={p} kit={d.kit} host={d.host} onMark={mark} />)}
              </div>
            </div>
          ))}

          <p className="mt-8 mb-2 text-center text-[12px] mg-subtle">List started from PlacesToPostYourStartup (CC0), checked and extended by Genie.</p>
        </>
      )}
    </OperatorShell>
  );
}

function KitView({ kit }) {
  const rows = [
    ["Tagline", kit.tagline], ["Short description", kit.short], ["Long description", kit.long],
    ["Categories", kit.categories?.join(", ")], ["Tags", kit.tags?.join(", ")],
    ["Compare with", kit.competitors?.join(", ")], ["Maker comment", kit.launchComment],
    ["Show HN title", kit.showhnTitle], ["Reddit post", kit.redditTitle ? `${kit.redditTitle}\n\n${kit.redditBody}` : ""], ["Founder story", kit.story],
  ].filter(([, v]) => v);
  return (
    <div className="mt-3 flex flex-col gap-2">
      {rows.map(([k, v]) => <CopyBlock key={k} label={k} text={v} />)}
    </div>
  );
}

function CopyBlock({ label, text }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="p-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold mg-subtle">{label}</p>
        <button onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
          className="text-[12px] font-semibold" style={{ color: "var(--accent-ink)", background: "none", border: 0, cursor: "pointer" }}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="mt-1 text-[13px]" style={{ color: "var(--fg)", whiteSpace: "pre-wrap" }}>{text}</p>
    </div>
  );
}

function PlaceRow({ p, kit, host, onMark }) {
  const [liveUrl, setLiveUrl] = useState("");
  const [askLive, setAskLive] = useState(false);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const st = p.status?.state || null;
  const text = copyFor(p, kit, host);

  async function copyOpen() {
    if (text) { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {} }
    window.open(p.url, "_blank", "noopener,noreferrer");
  }

  async function saveLive() {
    setNote("Checking the listing…");
    const j = await onMark(p.id, "live", liveUrl);
    setNote(j?.link?.found ? (j.link.nofollow ? "Found your link (nofollow: good for visitors and AI, not for Google ranking)." : "Found your link. Counted as an earned link.") : "Saved. Genie couldn't see a link to your site on that page yet; many listings add it after review.");
    setAskLive(false);
  }

  const bg = st === "live" ? "var(--signal-live-soft)" : st ? "var(--surface-2)" : "var(--surface)";
  return (
    <div className="p-3.5 rounded-xl" style={{ border: "1px solid var(--hair)", background: bg, opacity: st === "skipped" ? 0.6 : 1 }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0" style={{ flex: "1 1 320px" }}>
          <p className="text-[14px] font-semibold flex items-center gap-2 flex-wrap" style={{ color: "var(--fg)" }}>
            {p.name}
            <span className="mg-pill">{TIER[p.tier]}</span>
            {p.region && <span className="mg-pill">{p.region}</span>}
            {st === "submitted" && <span className="mg-pill">submitted</span>}
            {st === "live" && <span className="mg-verified">✓ live</span>}
            {st === "skipped" && <span className="mg-pill">skipped</span>}
          </p>
          <p className="text-[12.5px] mg-muted mt-0.5">{p.why}</p>
          {p.rule && <p className="text-[12px] mg-subtle mt-0.5">Rule: {p.rule}</p>}
          {p.status?.url && <a href={p.status.url} target="_blank" rel="noopener noreferrer" className="text-[12px]" style={{ color: "var(--accent-ink)" }}>Your listing ↗</a>}
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button onClick={copyOpen} className="mg-btn mg-btn--dawn" style={btn} title={text ? "Copies your text, then opens the page" : "Opens the page"}>
            {copied ? "Copied, opening…" : text ? "Copy & open" : "Open"}
          </button>
          {!st && <button onClick={() => onMark(p.id, "submitted")} className="mg-btn mg-btn--ghost" style={btn}>I submitted it</button>}
          {st === "submitted" && <button onClick={() => setAskLive((v) => !v)} className="mg-btn mg-btn--ghost" style={btn}>It&apos;s live</button>}
          {!st && <button onClick={() => onMark(p.id, "skipped")} className="text-[12px] mg-subtle" style={{ background: "none", border: 0, cursor: "pointer", textDecoration: "underline" }}>Skip</button>}
          {st && <button onClick={() => onMark(p.id, "undo")} className="text-[12px] mg-subtle" style={{ background: "none", border: 0, cursor: "pointer", textDecoration: "underline" }}>Undo</button>}
        </div>
      </div>
      {askLive && (
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <input value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="Paste the address of your listing" className="mg-field mg-focus" style={{ flex: 1, minWidth: 240, fontSize: 13 }} />
          <button onClick={saveLive} disabled={!liveUrl.trim()} className="mg-btn mg-btn--dawn disabled:opacity-50" style={btn}>Save</button>
        </div>
      )}
      {note && <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--signal-live-ink)" }}>{note}</p>}
      {!kit && !st && <p className="mt-1.5 text-[11.5px] mg-subtle">Write your launch kit above and Copy &amp; open will copy your text for you.</p>}
    </div>
  );
}
