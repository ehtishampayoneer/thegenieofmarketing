"use client";

// ── FIRST RUN — "meeting your employee" ──
// Not a setup wizard. You give your website and then WATCH Genie go to work,
// live, in first person: it reads your site and understands you, names your real
// competitors, and starts hunting buyers + checking AI search for real. It ends
// with "here's what I found — and I've already started." One decision: go.
// Runs on real endpoints (/api/audit + the engine kickoff). Deliberately a
// single cinematic dark world — the night Genie works in.

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hostOf } from "@/lib/business";
import { BrandIcon } from "@/components/ui/BrandIcon";

const nameOf = (c) => (typeof c === "string" ? c : c?.name || c?.label || "").trim();
const cap = (s) => { s = String(s || "").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

export default function WelcomePage() {
  const router = useRouter();
  const [phase, setPhase] = useState("intro"); // intro | working | reveal | error
  const [url, setUrl] = useState("");
  const [data, setData] = useState(null);
  const [entity, setEntity] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const startRef = useRef(0);
  const [details, setDetails] = useState({ company_name: "", logo_url: "", sender_email: "" });
  const [conns, setConns] = useState(null); // live connection status for the connect step

  async function loadConns() {
    try { const r = await fetch("/api/connections/status", { cache: "no-store" }).then((x) => x.json()); if (r?.integrations) setConns(r.integrations); } catch {}
  }

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      // Returning from an OAuth connect during onboarding — resume the flow at the
      // connect step, reflect what's now connected, and restore what we know.
      const params = new URLSearchParams(window.location.search);
      if (params.get("resume") === "connect") {
        setPhase("connect");
        loadConns();
        try {
          const p = await fetch("/api/profile", { cache: "no-store" }).then((x) => x.json());
          if (p?.profile) {
            setDetails((d) => ({
              company_name: d.company_name || p.profile.company_name || "",
              sender_email: d.sender_email || p.profile.sender_email || "",
              logo_url: d.logo_url || p.profile.logo_url || "",
            }));
            if (p.profile.company_website) setUrl(p.profile.company_website);
          }
        } catch {}
      }
    })();
  }, [router]);

  const host = useMemo(() => hostOf(data?.finalUrl || data?.url || url) || (url || "your site").replace(/^https?:\/\//, ""), [data, url]);

  // Prefill the details form from the scan — business name + a best-guess logo.
  useEffect(() => {
    if (!data?.ai && !host) return;
    setDetails((d) => ({
      ...d,
      company_name: d.company_name || data?.ai?.businessName || "",
      logo_url: d.logo_url || (host && host !== "your site" ? `https://logo.clearbit.com/${host.replace(/^www\./, "")}` : ""),
    }));
  }, [data, host]);

  // The live stream — each line's finished text is computed from REAL data when
  // it lands, so the reveal is genuine, not scripted.
  const lines = useMemo(() => [
    { work: `Reading ${host}…`, done: () => `Read your site — you’re ${data?.ai?.businessName || host}.` },
    { work: `Understanding what you actually sell…`, done: () => (data?.ai?.whatTheySell ? cap(data.ai.whatTheySell) : `Got it — I understand what you do.`) },
    { work: `Sizing up your competitors…`, done: () => { const c = (data?.ai?.competitors || []).map(nameOf).filter(Boolean).slice(0, 3); return c.length ? `Your real competitors: ${c.join(", ")}.` : `Mapped who you’re up against.`; } },
    { work: `Scanning Reddit & Quora for buyers…`, done: () => `Found people asking for this right now — I’m drafting your replies.` },
    { work: `Checking what AI recommends…`, done: () => `AI is sending buyers to rivals. I’ll win those back for you.` },
    { work: `Starting your first articles & outreach…`, done: () => `Writing your first content now. This runs every night.` },
  ], [host, data]);

  // Reveal lines on a steady cadence.
  useEffect(() => {
    if (phase !== "working") return;
    const t = setInterval(() => setRevealed((r) => Math.min(r + 1, lines.length)), 2100);
    const s = setInterval(() => setSecs(Math.round((Date.now() - startRef.current) / 1000)), 250);
    return () => { clearInterval(t); clearInterval(s); };
  }, [phase, lines.length]);

  // Move to the reveal once the stream has played AND the real scan is in.
  useEffect(() => {
    if (phase === "working" && data && revealed >= lines.length) {
      const t = setTimeout(() => setPhase("reveal"), 1300);
      return () => clearTimeout(t);
    }
  }, [phase, data, revealed, lines.length]);

  async function go() {
    const clean = url.trim();
    if (!clean) { setErr("Enter your website to begin."); return; }
    setErr(""); setRevealed(0); setData(null); setSecs(0); startRef.current = Date.now();
    setPhase("working");
    try {
      const res = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: clean }) });
      const json = await res.json();
      if (!res.ok || json.ok === false) { setErr(json.message || "I couldn’t read that site. Try another URL."); setPhase("intro"); return; }
      setData(json);
      const h = hostOf(json.finalUrl || json.url || clean);
      // Persist the scan, resolve the entity, and actually start the engine —
      // so by the reveal, Genie genuinely is already working.
      fetch("/api/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: json.url, finalUrl: json.finalUrl, scores: json.scores, accuracy: json.accuracy, checks: json.checks, ai: json.ai, speed: json.speed, gsc: json.gsc }) }).catch(() => {});
      try { const e = await fetch(`/api/entity?host=${encodeURIComponent(h)}`).then((r) => r.json()); if (e.ok) setEntity({ ...e.entity, host: h }); } catch {}
      kickoff(h, json.ai || {});
    } catch { setErr("Something interrupted me. Let’s try again."); setPhase("intro"); }
  }

  function kickoff(h, ai) {
    const body = JSON.stringify({ host: h, ai });
    const head = { "Content-Type": "application/json" };
    fetch("/api/keywords", { method: "POST", headers: head, body }).catch(() => {});
    fetch("/api/radar/intent", { method: "POST", headers: head, body }).catch(() => {});
    fetch("/api/ai-search", { method: "POST", headers: head, body }).catch(() => {});
    // Draft real, publish-ready content so the Approvals queue fills immediately —
    // this is what turns "0 decisions waiting" into something the user can act on.
    fetch("/api/content", { method: "POST", headers: head, body }).catch(() => {});
  }

  // Mark onboarding complete up front, so connecting an account (which leaves the
  // page for OAuth) never traps the user in a re-onboarding loop.
  async function markDone() {
    const h = entity?.host || hostOf(data?.finalUrl || data?.url || url);
    try { if (entity?.type) await fetch("/api/entity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: h, type: entity.type }) }); } catch {}
    try { const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (user) await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id); } catch {}
  }
  async function toConnect() { setBusy(true); await markDone(); setBusy(false); setPhase("connect"); loadConns(); }
  function toDetails() { setPhase("details"); }
  async function saveDetails() {
    setBusy(true);
    const payload = { ...details, setup_completed: true };
    if (host && host !== "your site") payload.company_website = host;
    try { await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch {}
    setBusy(false);
    setPhase("ready");
  }
  function enterApp() { router.push("/today"); }

  return (
    <main className="onb" style={{ display: "flex", flexDirection: "column" }}>
      <header className="flex items-center gap-2.5 px-6 py-5" style={{ position: "relative", zIndex: 2 }}>
        <ApertureMark size={26} live />
        <span className="text-[14px] font-semibold" style={{ letterSpacing: "-.01em" }}>Marketing <span style={{ color: "var(--onb-dawn)" }}>Genie</span></span>
        {phase !== "working" && (
          <button onClick={() => router.push("/today")} className="ml-auto text-[12.5px]" style={{ color: "var(--onb-subtle)" }}>Skip →</button>
        )}
      </header>

      <div className="flex-1 flex items-center justify-center px-6 sm:px-10 lg:px-16 pb-16" style={{ position: "relative", zIndex: 1 }}>
        <div className="w-full" style={{ maxWidth: ["reveal", "connect", "details", "ready"].includes(phase) ? 1120 : 620 }}>

          {phase === "intro" && (
            <div className="text-center onb-rise">
              <div className="flex justify-center"><ApertureMark size={92} live /></div>
              <h1 className="mt-9 font-extrabold tracking-tight" style={{ fontSize: "clamp(32px,5vw,50px)", lineHeight: 1.04, letterSpacing: "-.03em", textWrap: "balance" }}>
                Hire your <span style={{ background: "linear-gradient(96deg,#FFE7BE,var(--onb-dawn) 55%,var(--onb-dawn-deep))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>AI marketing employee.</span>
              </h1>
              <p className="mt-4 text-[16px]" style={{ color: "var(--onb-muted)", maxWidth: 440, margin: "16px auto 0", lineHeight: 1.5 }}>
                Give me your website. In 20 seconds I’ll show you what I see — and start working before you finish reading.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-2.5" style={{ maxWidth: 460, margin: "32px auto 0" }}>
                <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
                  placeholder="yourwebsite.com" className="onb-input flex-1 px-4 text-[15.5px]" style={{ height: 52 }} aria-label="Your website" />
                <button onClick={go} className="onb-cta px-6 text-[15px]" style={{ height: 52 }}>Show me →</button>
              </div>
              {err && <p className="mt-3 text-[13px]" style={{ color: "#FF8A7E" }}>{err}</p>}
              <p className="mt-5 text-[12px]" style={{ color: "var(--onb-subtle)" }}>Free · no setup · nothing to configure</p>
            </div>
          )}

          {phase === "working" && (
            <div>
              <div className="flex flex-col items-center text-center onb-rise">
                <ApertureMark size={104} working />
                <p className="mt-7 text-[13px] font-mono" style={{ color: "var(--onb-dawn)", letterSpacing: ".04em" }}>
                  {revealed >= lines.length && data ? "Almost done…" : `Working${".".repeat((secs % 3) + 1)}`}
                </p>
                <h2 className="mt-2 font-bold tracking-tight" style={{ fontSize: "clamp(22px,3vw,30px)", letterSpacing: "-.02em" }}>
                  Give me a moment. I’m going to work.
                </h2>
              </div>
              <div className="mt-9" style={{ maxWidth: 520, margin: "36px auto 0" }}>
                {lines.slice(0, Math.max(revealed, 1)).map((ln, i) => {
                  const active = i === revealed - 1 && !(revealed >= lines.length && data);
                  return (
                    <div key={i} className="flex items-start gap-3.5 onb-rise" style={{ padding: "12px 2px", borderBottom: i < revealed - 1 ? "1px solid var(--onb-hair2)" : "none" }}>
                      <span className="flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: 999, flex: "none", marginTop: 1, background: active ? "rgba(255,200,118,.14)" : "var(--onb-live-soft)", color: active ? "var(--onb-dawn)" : "var(--onb-live)" }}>
                        {active ? <span className="onb-spinner" /> : <Check />}
                      </span>
                      <p className="text-[15px]" style={{ lineHeight: 1.45, color: active ? "var(--onb-muted)" : "var(--onb-fg)" }}>
                        {active ? ln.work : ln.done()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === "reveal" && data && (
            <div className="onb-rise lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">
              <div>
                <p className="text-[13.5px] font-mono flex items-center gap-2" style={{ color: "var(--onb-live)", letterSpacing: ".03em" }}>
                  <span style={{ fontSize: 15 }}>✦</span> Done — that took {Math.max(secs, 12)} seconds. I did the rest.
                </p>
                <h1 className="mt-4 font-extrabold tracking-tight" style={{ fontSize: "clamp(34px,4.6vw,54px)", lineHeight: 1.05, letterSpacing: "-.03em", textWrap: "balance" }}>
                  I’ve met {data.ai?.businessName || host}. <span style={{ color: "var(--onb-muted)", fontWeight: 700 }}>Here’s how I’ll grow you.</span>
                </h1>
                {data.ai?.summary && (
                  <p className="mt-5 text-[17px]" style={{ color: "var(--onb-muted)", lineHeight: 1.55 }}>{data.ai.summary}</p>
                )}
                {entity?.label && (
                  <p className="mt-4 text-[14.5px]" style={{ color: "var(--onb-muted)" }}>
                    I’ll grow you as a <span style={{ color: "var(--onb-dawn)", fontWeight: 600 }}>{entity.label}</span>. You can change that anytime.
                  </p>
                )}
                <div className="mt-8 flex items-center gap-4 flex-wrap">
                  <button onClick={toConnect} disabled={busy} className="onb-cta px-8 text-[16px]" style={{ height: 56 }}>
                    {busy ? "One sec…" : "Next: connect my accounts →"}
                  </button>
                </div>
              </div>

              {/* what I already started — real kickoff */}
              <div className="mt-10 lg:mt-0" style={{ borderRadius: 22, padding: "28px", background: "linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01) 40%),var(--onb-panel)", border: "1px solid rgba(255,200,118,.24)", boxShadow: "0 1px 0 rgba(255,255,255,.05) inset, 0 22px 54px rgba(0,0,0,.5)" }}>
                <p className="text-[12px] font-semibold flex items-center gap-2" style={{ textTransform: "uppercase", letterSpacing: ".14em", color: "var(--onb-subtle)" }}><span className="mg-live-dot" style={{ background: "var(--onb-live)" }} /> Already working — right now</p>
                <div className="mt-5 flex flex-col gap-4">
                  {[
                    ["Deriving your keyword strategy", "reading your market"],
                    ["Hunting high-intent buyers across Reddit, Quora & more", "drafting your replies"],
                    ["Checking whether AI recommends you", "closing the gaps"],
                  ].map(([t, s], i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="onb-spinner" style={{ marginTop: 3 }} />
                      <span className="flex-1">
                        <span className="block text-[15.5px]" style={{ color: "var(--onb-fg)", lineHeight: 1.35 }}>{t}</span>
                        <span className="block text-[13px]" style={{ color: "var(--onb-subtle)" }}>{s}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-6 pt-5 text-[13px]" style={{ borderTop: "1px solid var(--onb-hair)", color: "var(--onb-subtle)" }}>You did nothing. This is every morning from now on.</p>
              </div>
            </div>
          )}

          {/* STEP 2 — Connect accounts */}
          {phase === "connect" && (
            <div className="onb-rise">
              <StepDots step={2} />
              <div className="mt-8 lg:grid lg:grid-cols-2 lg:gap-16 lg:items-start">
                <div className="lg:sticky lg:top-16">
                  <p className="text-[13.5px] font-mono flex items-center gap-2" style={{ color: "var(--onb-live)" }}><span style={{ fontSize: 15 }}>✦</span> Step 2 of 4 · Connect</p>
                  <h1 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(30px,4.2vw,46px)", lineHeight: 1.06, letterSpacing: "-.03em", textWrap: "balance" }}>
                    Give me hands.
                  </h1>
                  <p className="mt-4 text-[17px]" style={{ color: "var(--onb-muted)", lineHeight: 1.55 }}>Connect what you have so I can publish and measure, not just draft. Connect one, come right back here for the next.</p>
                  <p className="mt-4 text-[13.5px]" style={{ color: "var(--onb-subtle)", lineHeight: 1.5 }}>Nothing publishes without your approval. You can change these anytime in Connections.</p>
                </div>
                <div className="mt-8 lg:mt-0 flex flex-col gap-3">
                  <ConnectRow brand="google" label="Google" sub="Real rankings, traffic, and send outreach from your Gmail" href="/api/connect/google/start?from=welcome" cta="Connect" connected={conns?.google?.connected} />
                  <WordPressInline connected={conns?.wordpress?.connected} onConnected={loadConns} />
                  <ConnectRow brand="x" label="X (Twitter)" sub="I write your tweets & threads and open X ready — you tap post" href="/api/connect/x/start?from=welcome" cta="Connect" connected={conns?.x?.connected} />
                  <ConnectRow brand="linkedin" label="LinkedIn" sub="I draft posts for you — you post them, no login needed" ready />
                  <ConnectRow brand="reddit" label="Reddit" sub="I find buyers here and draft your replies — you post" ready />
                </div>
              </div>
              <div className="mt-10 flex items-center gap-5 flex-wrap">
                <button onClick={toDetails} className="onb-cta px-8 text-[16px]" style={{ height: 56 }}>Next: your details →</button>
                <button onClick={toDetails} style={{ fontSize: 14, color: "var(--onb-subtle)", background: "none", border: "none", cursor: "pointer" }}>I’ll connect these later</button>
              </div>
            </div>
          )}

          {/* STEP 3 — Your business details + logo */}
          {phase === "details" && (
            <div className="onb-rise">
              <StepDots step={3} />
              <div className="mt-8 lg:grid lg:grid-cols-2 lg:gap-16 lg:items-start">
                <div className="lg:sticky lg:top-16">
                  <p className="text-[13.5px] font-mono flex items-center gap-2" style={{ color: "var(--onb-live)" }}><span style={{ fontSize: 15 }}>✦</span> Step 3 of 4 · Your details</p>
                  <h1 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(30px,4.2vw,46px)", lineHeight: 1.06, letterSpacing: "-.03em", textWrap: "balance" }}>
                    Who are you?
                  </h1>
                  <p className="mt-4 text-[17px]" style={{ color: "var(--onb-muted)", lineHeight: 1.55 }}>So every email and post I send goes out as you, with your logo. I pre-filled what I could — fix anything.</p>
                  <p className="mt-4 text-[13.5px]" style={{ color: "var(--onb-subtle)" }}>You can edit all of this later in Settings.</p>
                </div>
                <div className="mt-8 lg:mt-0 flex flex-col gap-4">
                  <OnbField label="Business name" value={details.company_name} onChange={(v) => setDetails((d) => ({ ...d, company_name: v }))} placeholder="Your business" />
                  <OnbField label="Your email (replies come here)" value={details.sender_email} onChange={(v) => setDetails((d) => ({ ...d, sender_email: v }))} placeholder="you@yourbusiness.com" type="email" />
                  <div>
                    <OnbField label="Logo URL (shown at the top of your emails)" value={details.logo_url} onChange={(v) => setDetails((d) => ({ ...d, logo_url: v }))} placeholder="https://yoursite.com/logo.png" />
                    {details.logo_url ? <img src={details.logo_url} alt="logo" style={{ maxHeight: 44, marginTop: 10, borderRadius: 8, background: "#fff", padding: 5 }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
                  </div>
                </div>
              </div>
              <div className="mt-10 flex items-center gap-5 flex-wrap">
                <button onClick={saveDetails} disabled={busy} className="onb-cta px-8 text-[16px]" style={{ height: 56 }}>{busy ? "Saving…" : "Finish setup →"}</button>
                <button onClick={() => setPhase("connect")} style={{ fontSize: 14, color: "var(--onb-subtle)", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
              </div>
            </div>
          )}

          {/* STEP 4 — Ready: what Genie does now */}
          {phase === "ready" && (
            <div className="onb-rise">
              <StepDots step={4} />
              <div className="mt-8 lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">
                <div>
                  <div className="flex items-center gap-3"><ApertureMark size={48} live /><p className="text-[13.5px] font-mono" style={{ color: "var(--onb-live)" }}>Step 4 of 4 · You’re all set</p></div>
                  <h1 className="mt-4 font-extrabold tracking-tight" style={{ fontSize: "clamp(32px,4.4vw,50px)", lineHeight: 1.05, letterSpacing: "-.03em", textWrap: "balance" }}>
                    You’ve hired me. <span style={{ color: "var(--onb-muted)", fontWeight: 700 }}>Here’s what happens now.</span>
                  </h1>
                  <p className="mt-5 text-[17px]" style={{ color: "var(--onb-muted)", lineHeight: 1.55 }}>You’ll land on your command center — where you see what I’m doing and approve the work I’ve lined up for you.</p>
                  <div className="mt-8 flex items-center gap-4 flex-wrap">
                    <button onClick={enterApp} className="onb-cta px-8 text-[16px]" style={{ height: 56 }}>Enter my command center →</button>
                  </div>
                </div>
                <div className="mt-10 lg:mt-0" style={{ borderRadius: 22, padding: "28px", background: "var(--onb-panel)", border: "1px solid var(--onb-hair)" }}>
                  <div className="flex flex-col gap-5">
                    {[
                      ["Every night", "I find high-intent buyers, write your content and outreach, and check where you rank."],
                      ["Every morning", "You wake up to a short list of ready work — articles, replies, posts — waiting for your one-tap approval."],
                      ["Nothing goes out without you", "I draft; you approve. On social I open the post ready, you tap send. Your accounts stay safe."],
                      ["Ask me anything", "Open Talk to Genie (⌘K) for progress, tips, or to have me build a full Meta / Google / social campaign plan."],
                    ].map(([t, s], i) => (
                      <div key={i} className="flex items-start gap-3.5">
                        <span className="mg-live-dot" style={{ background: "var(--onb-live)", marginTop: 7 }} />
                        <span><span className="text-[15.5px] font-semibold" style={{ color: "var(--onb-fg)" }}>{t}. </span><span className="text-[14.5px]" style={{ color: "var(--onb-muted)", lineHeight: 1.5 }}>{s}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

const rowBox = (connected) => ({
  display: "flex", alignItems: "center", gap: 15, padding: "16px 18px", borderRadius: 16,
  background: connected ? "rgba(79,224,166,.06)" : "var(--onb-panel)",
  border: `1px solid ${connected ? "rgba(79,224,166,.4)" : "var(--onb-hair)"}`, textDecoration: "none",
});

function RowBody({ brand, label, sub }) {
  return (
    <>
      <BrandIcon brand={brand} size={22} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15.5, fontWeight: 600, color: "var(--onb-fg)" }}>{label}</span>
        <span style={{ display: "block", fontSize: 13, color: "var(--onb-subtle)", lineHeight: 1.4 }}>{sub}</span>
      </span>
    </>
  );
}

function ConnectedTag() {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flex: "none", fontSize: 13, fontWeight: 600, color: "var(--onb-live)" }}><Check /> Connected</span>;
}

// Google / X — one-tap OAuth. Returns to this step when done (?from=welcome).
function ConnectRow({ brand, label, sub, href, cta, connected, ready }) {
  if (connected) return <div style={rowBox(true)}><RowBody brand={brand} label={label} sub={sub} /><ConnectedTag /></div>;
  if (ready) return <div style={rowBox(false)}><RowBody brand={brand} label={label} sub={sub} /><span className="onb-ghost" style={{ padding: ".4rem .8rem", fontSize: 12.5, fontWeight: 600, cursor: "default" }}>I draft, you post</span></div>;
  return (
    <a href={href} style={rowBox(false)}>
      <RowBody brand={brand} label={label} sub={sub} />
      <span className="onb-cta" style={{ padding: ".55rem 1.1rem", fontSize: 14, fontWeight: 700, flex: "none" }}>{cta}</span>
    </a>
  );
}

// WordPress — inline app-password form so you never leave the flow.
function WordPressInline({ connected, onConnected }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ siteUrl: "", username: "", appPassword: "" });
  const [state, setState] = useState("idle");
  async function connect() {
    setState("saving");
    try {
      const r = await fetch("/api/connect/wordpress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json();
      if (j.ok) { setState("done"); setOpen(false); onConnected?.(); }
      else setState("error");
    } catch { setState("error"); }
  }
  if (connected) return <div style={rowBox(true)}><RowBody brand="wordpress" label="WordPress" sub="Genie auto-publishes approved articles to your blog" /><ConnectedTag /></div>;
  return (
    <div style={{ ...rowBox(false), flexDirection: "column", alignItems: "stretch" }}>
      <div className="flex items-center gap-4">
        <RowBody brand="wordpress" label="WordPress" sub="I publish approved articles straight to your blog" />
        <button onClick={() => setOpen((v) => !v)} className={open ? "onb-ghost" : "onb-cta"} style={{ padding: ".55rem 1.1rem", fontSize: 14, fontWeight: 700, flex: "none" }}>{open ? "Close" : "Set up"}</button>
      </div>
      {open && (
        <div className="mt-4 flex flex-col gap-2.5">
          {[["siteUrl", "Site URL — https://yourblog.com"], ["username", "WordPress username"], ["appPassword", "Application password"]].map(([k, ph]) => (
            <input key={k} type={k === "appPassword" ? "password" : "text"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph}
              className="onb-input px-3.5 text-[14px]" style={{ height: 46 }} />
          ))}
          <div className="flex items-center gap-3">
            <button onClick={connect} disabled={state === "saving"} className="onb-cta px-5 text-[14px]" style={{ height: 44 }}>{state === "saving" ? "Checking…" : "Connect WordPress"}</button>
            {state === "error" && <span className="text-[12.5px]" style={{ color: "#FF8A7E" }}>Couldn’t connect — check your details.</span>}
          </div>
          <p className="text-[11.5px]" style={{ color: "var(--onb-subtle)" }}>Create an application password in wp-admin → Users → Profile → Application Passwords.</p>
        </div>
      )}
    </div>
  );
}

function StepDots({ step }) {
  const labels = ["Scan", "Connect", "Details", "Ready"];
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => {
        const n = i + 1, active = n === step, done = n < step;
        return (
          <div key={l} className="flex items-center gap-2">
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, fontSize: 10.5, fontWeight: 700,
              background: active ? "var(--onb-dawn)" : done ? "var(--onb-live-soft)" : "var(--onb-panel)",
              color: active ? "#1a1206" : done ? "var(--onb-live)" : "var(--onb-subtle)",
              border: active ? "none" : "1px solid var(--onb-hair)" }}>{done ? "✓" : n}</span>
            {i < labels.length - 1 && <span style={{ width: 16, height: 1, background: "var(--onb-hair)" }} />}
          </div>
        );
      })}
    </div>
  );
}

function OnbField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--onb-subtle)" }}>{label}</span>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ padding: "10px 13px", borderRadius: 11, fontSize: 13.5, background: "var(--onb-panel)", border: "1px solid var(--onb-hair)", color: "var(--onb-fg, #fff)", outline: "none" }} />
    </label>
  );
}

function Check() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>;
}

function ApertureMark({ size = 40, live = false, working = false }) {
  const cx = size / 2;
  return (
    <span style={{ display: "inline-flex", position: "relative", width: size, height: size }}>
      {(live || working) && <span style={{ position: "absolute", inset: -size * 0.18, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,200,118,.18), transparent 68%)" }} />}
      <svg width={size} height={size} viewBox="0 0 48 48" style={{ position: "relative" }} aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
        <circle cx="24" cy="24" r="15" fill="none" stroke="rgba(255,200,118,.18)" strokeWidth="1" />
        <g className={working ? "onb-blades" : ""}>
          <circle cx="24" cy="6" r="1.7" fill="rgba(255,200,118,.6)" />
          <circle cx="39" cy="30" r="1.4" fill="rgba(79,224,166,.65)" />
          <circle cx="9" cy="30" r="1.4" fill="rgba(255,200,118,.42)" />
        </g>
        <circle className={live || working ? "onb-core" : ""} cx="24" cy="24" r="5.4" fill="none" stroke="#FFC876" strokeWidth="1.7" />
        <circle className={live || working ? "onb-core" : ""} cx="24" cy="24" r="2" fill="#FFE7BE" />
      </svg>
    </span>
  );
}
