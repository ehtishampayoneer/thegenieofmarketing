"use client";

// ── V2 FIRST-RUN — the on-ramp ──
// Onboarding that IS the product working: it runs the real scan, confirms what
// entity Genie is growing, and kicks off the actual engine (keyword derivation +
// buyer-intent hunt + AI-search check) in the background — so by the time the user
// reaches their command center, Genie is already producing. Magical because real.
// Locked Aperture/Dawn language. Auth-gated; unauthenticated → /login.

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hostOf } from "@/lib/business";
import { entityTypeOptions } from "@/lib/entity";
import Aperture from "@/components/brand/Aperture";
import { GenieLockup } from "@/components/brand/GenieMark";
import { Button } from "@/components/ui/v2/primitives";

const STEPS = ["Reading your site…", "Seeing what Google sees…", "Understanding what you sell…", "Sizing up your competitors…", "Mapping where your buyers are…"];

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState("intro"); // intro | website | scanning | reveal | done
  const [url, setUrl] = useState("");
  const [data, setData] = useState(null);
  const [entity, setEntity] = useState(null);
  const [typeSel, setTypeSel] = useState("business");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sIdx, setSIdx] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.replace("/login");
    })();
  }, [router]);

  useEffect(() => {
    if (step !== "scanning") return;
    timer.current = setInterval(() => setSIdx((i) => Math.min(i + 1, STEPS.length - 1)), 1600);
    return () => clearInterval(timer.current);
  }, [step]);

  async function analyze() {
    const clean = url.trim();
    if (!clean) { setErr("Enter your website to begin."); return; }
    setErr(""); setSIdx(0); setStep("scanning");
    try {
      const res = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: clean }) });
      const json = await res.json();
      if (!res.ok || json.ok === false) { setErr(json.message || "Couldn't scan that site. Try another."); setStep("website"); return; }
      setData(json);
      const host = hostOf(json.finalUrl || json.url || clean);
      // Persist the scan, then resolve the entity.
      try {
        await fetch("/api/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: json.url, finalUrl: json.finalUrl, scores: json.scores, accuracy: json.accuracy, checks: json.checks, ai: json.ai, speed: json.speed, gsc: json.gsc }) });
      } catch {}
      try {
        const e = await fetch(`/api/entity?host=${encodeURIComponent(host)}`).then((r) => r.json());
        if (e.ok) { setEntity({ ...e.entity, host }); setTypeSel(e.entity.type); }
      } catch {}
      setStep("reveal");
    } catch { setErr("Something interrupted the scan. Try again."); setStep("website"); }
  }

  async function confirmEntity() {
    setBusy(true);
    const host = entity?.host || hostOf(data?.finalUrl || data?.url || url);
    try { await fetch("/api/entity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, type: typeSel }) }); } catch {}
    kickoff(host, data?.ai || {});
    setBusy(false);
    setStep("done");
  }

  // Start the real engine in the background — the magic is that it's genuine.
  function kickoff(host, ai) {
    const body = JSON.stringify({ host, ai });
    const h = { "Content-Type": "application/json" };
    fetch("/api/keywords", { method: "POST", headers: h, body }).catch(() => {});
    fetch("/api/radar/intent", { method: "POST", headers: h, body }).catch(() => {});
    fetch("/api/ai-search", { method: "POST", headers: h, body }).catch(() => {});
  }

  const name = data?.ai?.businessName || hostOf(data?.finalUrl || "") || "your business";
  const groups = entityTypeOptions().reduce((a, o) => { (a[o.group] ||= []).push(o); return a; }, {});

  return (
    <main className="mg" style={{ minHeight: "100vh", fontFamily: "var(--font-ui)", display: "flex", flexDirection: "column" }}>
      <header className="flex items-center px-6 py-4" style={{ borderBottom: "1px solid var(--hair)" }}>
        <GenieLockup size={32} live />
        <button onClick={() => router.push("/today")} className="ml-auto text-[13px] mg-subtle hover:opacity-80">Skip to command center →</button>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl">

          {step === "intro" && (
            <div className="text-center mg-rise">
              <div className="flex justify-center"><Aperture state="idle" size={128} /></div>
              <h1 className="mt-8 text-[38px] leading-[1.06] font-extrabold tracking-tight" style={{ color: "var(--fg)" }}>
                Meet Genie — your <span className="dawn-text">AI marketing employee.</span>
              </h1>
              <p className="mt-4 text-[16px] mg-muted max-w-md mx-auto">It works while you sleep to get you discovered, reach buyers, and grow — you just approve. Show it what you’re growing.</p>
              <Button variant="dawn" className="mt-8 text-[15px] px-6 py-3.5" onClick={() => setStep("website")}>Let’s begin →</Button>
            </div>
          )}

          {(step === "website") && (
            <div className="text-center mg-rise">
              <div className="flex justify-center"><Aperture state="listening" size={104} /></div>
              <h1 className="mt-7 text-[30px] font-extrabold tracking-tight" style={{ color: "var(--fg)" }}>What are you growing?</h1>
              <p className="mt-2 text-[15px] mg-muted">Drop your website. I’ll read it and tell you what I see.</p>
              <div className="mt-6 flex flex-col sm:flex-row gap-2.5 max-w-md mx-auto">
                <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && analyze()}
                  placeholder="yourwebsite.com"
                  className="flex-1 px-4 py-3.5 rounded-xl mg-focus text-[15px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg)" }} />
                <Button variant="dawn" className="px-6 py-3.5" onClick={analyze}>Scan my site</Button>
              </div>
              {err && <p className="mt-3 text-[13px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}
              <p className="mt-4 text-[12px] mg-subtle">Free · takes ~20 seconds · no credit card</p>
            </div>
          )}

          {step === "scanning" && (
            <div className="text-center">
              <div className="flex justify-center"><Aperture state="scanning" size={128} /></div>
              <p className="mt-8 text-[22px] font-bold tracking-tight" style={{ color: "var(--fg)" }}>{STEPS[sIdx]}</p>
              <p className="mt-2 text-[14px] mg-subtle">Genie is analyzing {url}</p>
              <div className="mt-6 flex justify-center gap-1.5">
                {STEPS.map((_, i) => <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i <= sIdx ? 26 : 8, background: i <= sIdx ? "var(--accent)" : "var(--border)" }} />)}
              </div>
            </div>
          )}

          {step === "reveal" && data && (
            <div className="mg-rise">
              <div className="flex items-center gap-4">
                <Aperture state="discovering" size={72} />
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] mg-subtle">Here’s what I found</p>
                  <h1 className="text-[26px] font-extrabold tracking-tight leading-tight" style={{ color: "var(--fg)" }}>{name}</h1>
                </div>
                <div className="ml-auto text-center">
                  <div className="text-[34px] font-bold leading-none mg-num" style={{ color: "var(--accent-ink)" }}>{data.scores?.overall ?? "—"}</div>
                  <div className="text-[10px] mg-subtle">Growth score</div>
                </div>
              </div>

              {data.ai?.summary && (
                <div className="mt-5 mg-surface p-4">
                  <p className="text-[14px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>{data.ai.summary}</p>
                </div>
              )}

              {/* Entity confirmation — teaches Genie who you are */}
              <div className="mt-4 mg-surface p-5" style={{ borderColor: "var(--accent)", boxShadow: "var(--shadow-dawn)" }}>
                {!changing ? (
                  <>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
                      I’ll grow you as a <span className="dawn-text">{entity?.label || "business"}</span>.
                    </p>
                    <p className="text-[13px] mg-muted mt-1">That tailors every channel, content plan, and outreach move to you. Right?</p>
                    <div className="mt-4 flex items-center gap-2.5">
                      <Button variant="dawn" disabled={busy} onClick={confirmEntity}>{busy ? "Setting up…" : "Yes, that’s me →"}</Button>
                      <Button variant="ghost" onClick={() => setChanging(true)}>No, change it</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[14px] font-semibold mb-2" style={{ color: "var(--fg)" }}>What should I grow you as?</p>
                    <select value={typeSel} onChange={(e) => setTypeSel(e.target.value)}
                      className="w-full text-[14px] rounded-lg px-3 py-2.5 mg-focus" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" }}>
                      {Object.entries(groups).map(([g, items]) => (
                        <optgroup key={g} label={g}>{items.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>
                      ))}
                    </select>
                    <div className="mt-3"><Button variant="dawn" disabled={busy} onClick={confirmEntity}>{busy ? "Setting up…" : "Set it & start →"}</Button></div>
                  </>
                )}
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="text-center mg-rise">
              <div className="flex justify-center"><Aperture state="working" size={128} /></div>
              <h1 className="mt-8 text-[32px] font-extrabold tracking-tight" style={{ color: "var(--fg)" }}>I’m already <span className="dawn-text">on it.</span></h1>
              <p className="mt-3 text-[15px] mg-muted max-w-md mx-auto">Right now I’m deriving your keywords, hunting buyers on Reddit and Quora, and checking whether AI search recommends you. Your first work will be waiting.</p>
              <div className="mt-6 max-w-sm mx-auto space-y-2 text-left">
                {["Deriving your keyword strategy", "Hunting high-intent buyers across the web", "Checking your AI-search visibility"].map((t, i) => (
                  <div key={i} className="flex items-center gap-2.5 mg-surface-quiet px-3.5 py-2.5">
                    <span className="mg-live-dot" />
                    <span className="text-[13px]" style={{ color: "var(--fg)" }}>{t}</span>
                  </div>
                ))}
              </div>
              <Button variant="dawn" className="mt-8 text-[15px] px-6 py-3.5" onClick={() => router.push("/today")}>Enter my command center →</Button>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
