"use client";

// ── FOUNDATION LINKS ──
// A tracked checklist of high-authority free sites where your brand should have a
// profile — each is a real backlink + a place Google/AI pick up your brand. Genie
// writes the bios; you create the accounts and mark them done. Progress is saved.

import { useState, useEffect, useCallback } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";

export default function FoundationPage() {
  const [sites, setSites] = useState([]);
  const [bios, setBios] = useState(null);
  const [done, setDone] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [openGuide, setOpenGuide] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/foundation", { cache: "no-store" }).then((r) => r.json());
      if (j?.ok) { setSites(j.sites || []); setBios(j.bios || null); setDone(j.done || []); }
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(id) {
    const isDone = done.includes(id);
    setDone((d) => (isDone ? d.filter((x) => x !== id) : [...d, id])); // optimistic
    try { await fetch("/api/foundation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, done: !isDone }) }); } catch {}
  }
  function copy(text, what) { try { navigator.clipboard.writeText(text); setToast(`${what} copied.`); } catch {} }

  const total = sites.length;
  const doneCount = sites.filter((s) => done.includes(s.id)).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <OperatorShell active="foundation">
      <div className="max-w-[1000px]">
        <p className="mg-eyebrow"><Icon.link size={14} /> Foundation links</p>
        <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(29px,3.2vw,40px)" }}>Plant your brand <span className="dawn-text">everywhere it counts.</span></h1>
        <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "var(--measure)" }}>Each of these is a free, high-authority profile — a real backlink and a place Google and AI answer engines pick up your brand. Genie wrote your bios below; open each site, create the account, paste the bio, and mark it done. Your progress is saved.</p>

        {/* progress */}
        <div className="mt-5 flex items-center gap-4">
          <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-full rounded-full dawn-fill" style={{ width: `${pct}%`, transition: "width .5s var(--ease-out)" }} />
          </div>
          <span className="text-[13px] font-semibold shrink-0" style={{ color: "var(--fg)" }}><span className="mg-num">{doneCount}</span> / {total} done</span>
        </div>

        {/* bio pack */}
        {bios && (
          <Card className="mt-5 p-5">
            <p className="mg-klabel">YOUR BIO PACK · paste these when you sign up</p>
            <div className="mt-3 flex flex-col gap-3">
              <BioRow label="Tagline" text={bios.tagline} onCopy={() => copy(bios.tagline, "Tagline")} />
              <BioRow label="Short bio" text={bios.short} onCopy={() => copy(bios.short, "Short bio")} />
              <BioRow label="Long bio" text={bios.long} onCopy={() => copy(bios.long, "Long bio")} />
              {bios.website && <BioRow label="Website" text={bios.website} onCopy={() => copy(bios.website, "Website")} mono />}
            </div>
            <p className="mt-2 text-[12px] mg-subtle">Tip: keep your name, bio and link identical across all profiles — consistency is what strengthens your brand entity for Google + AI.</p>
          </Card>
        )}

        {/* sites */}
        {loading ? (
          <div className="mt-6 mg-surface p-8 text-center text-[13px] mg-subtle">Loading your checklist…</div>
        ) : (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sites.map((s) => {
              const isDone = done.includes(s.id);
              return (
                <Card key={s.id} className="p-4" style={isDone ? { opacity: 0.7 } : undefined}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggle(s.id)} aria-label={isDone ? "Mark not done" : "Mark done"} className="mg-focus shrink-0" style={{ width: 22, height: 22, marginTop: 1, borderRadius: 6, border: `1.5px solid ${isDone ? "var(--signal-live)" : "var(--border-strong)"}`, background: isDone ? "var(--signal-live)" : "transparent", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isDone && <Icon.check size={14} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{s.name}</span>
                        <Pill tone="neutral">{s.cat}</Pill>
                        {s.conditional && <Pill tone="info">if software</Pill>}
                      </div>
                      <p className="mt-1 text-[12px] mg-muted leading-snug">{s.why}</p>
                      <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="mg-btn mg-btn--dawn" style={{ fontSize: 12 }}>Open &amp; create →</a>
                        {s.guide && <button onClick={() => setOpenGuide(openGuide === s.id ? "" : s.id)} className="text-[12px] mg-focus" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-ink)", fontWeight: 600 }}>{openGuide === s.id ? "Hide guide" : "Setup guide + code"}</button>}
                        {isDone ? <span className="text-[12px] font-semibold" style={{ color: "var(--signal-live-ink)" }}>Done ✓</span> : <button onClick={() => toggle(s.id)} className="text-[12px] mg-subtle mg-focus" style={{ background: "none", border: "none", cursor: "pointer" }}>Mark done</button>}
                      </div>
                      {s.guide && openGuide === s.id && (
                        <div className="mt-3">
                          <ol className="flex flex-col gap-1.5">
                            {s.guide.map((step, i) => (
                              <li key={i} className="flex gap-2 text-[12px] mg-muted"><span className="mg-num shrink-0 font-semibold" style={{ color: "var(--accent-ink)" }}>{i + 1}.</span><span>{step}</span></li>
                            ))}
                          </ol>
                          {s.snippet && (
                            <div className="mt-3 flex flex-col gap-2">
                              <p className="text-[11px] mg-subtle">Genie made you a simple, legit extension — paste these three files:</p>
                              {Object.entries(s.snippet).map(([fname, code]) => (
                                <div key={fname}>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold" style={{ color: "var(--fg)", fontFamily: "var(--font-mono, monospace)" }}>{fname}</span>
                                    <button onClick={() => copy(code, fname)} className="mg-btn mg-btn--quiet" style={{ fontSize: 11, padding: ".2rem .5rem" }}>Copy</button>
                                  </div>
                                  <pre className="mt-1 text-[11px] leading-snug" style={{ background: "var(--surface-sunken)", padding: "8px 10px", borderRadius: 8, maxHeight: 150, overflow: "auto", fontFamily: "var(--font-mono, monospace)", color: "var(--fg)" }}>{code}</pre>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
    </OperatorShell>
  );
}

function BioRow({ label, text, onCopy, mono }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[11px] font-bold uppercase tracking-wide mg-subtle shrink-0" style={{ width: 74, paddingTop: 3 }}>{label}</span>
      <p className="flex-1 text-[13px]" style={{ color: "var(--fg)", fontFamily: mono ? "var(--font-mono, monospace)" : undefined }}>{text}</p>
      <button onClick={onCopy} className="mg-btn mg-btn--quiet shrink-0" style={{ fontSize: 12 }}>Copy</button>
    </div>
  );
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [msg, onDone]);
  return (
    <div className="fixed left-1/2 z-50" style={{ bottom: 24, transform: "translateX(-50%)" }}>
      <div className="mg-surface px-4 py-2.5 text-[13px] mg-rise" style={{ boxShadow: "var(--shadow-3)", color: "var(--fg)", borderColor: "var(--border-strong)" }}>{msg}</div>
    </div>
  );
}
