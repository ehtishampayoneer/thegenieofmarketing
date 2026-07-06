"use client";

// ── GENIE CONSTITUTION (see lib/outcomes.js) ──
// The first impression. Genie is a glowing violet orb CHARACTER who flies
// across scenes demonstrating his powers — meeting an AI genius, not signing
// up for software. Story, not a feature list. Magic over corporate.

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

const SCREENS = [
  {
    id: "arrival",
    pos: { x: 0, y: -10 },
    lines: ["Hi. I'm Genie.", "Nice to meet you.", "You know those businesses that seem to be growing everywhere you look?", "There's a good chance I'm behind them."],
    cta: "Show me →",
  },
  {
    id: "diagnosis",
    pos: { x: 180, y: -120 },
    lines: ["First, I'll scan your website.", "In 30 seconds, I'll know exactly what's holding you back — the invisible things blocking you from being the next big product in your space.", "Missing SEO. Weak content. Broken trust signals. Missed opportunities your competitors are eating.", "I see everything."],
    cta: "What happens next? →",
  },
  {
    id: "plan",
    pos: { x: -160, y: -110 },
    lines: ["Then I'll build your growth plan.", "Blog articles that rank on Google.", "Social posts on the platforms your customers use.", "Smart comments in the communities where they already gather.", "Personalized outreach emails to the right people.", "Ads targeted where your buyers actually are.", "Everything, tailored to your business."],
    cta: "Then what? →",
  },
  {
    id: "execution",
    pos: { x: 0, y: -140 },
    lines: ["Then I'll do the work.", "You approve. I execute.", "I publish your articles. I post to your socials. I send your outreach. I run your ads.", "All from your accounts. Never spam. Always human-approved.", "You do what you're good at. I do everything else."],
    cta: "I love this. What about growth? →",
  },
  {
    id: "learning",
    pos: { x: 0, y: -20 },
    lines: ["And I get smarter every day.", "What worked. What didn't. What your audience loves.", "I learn from every post, every click, every reply — and adjust your plan so your growth compounds.", "That's how the businesses I quietly help become the next big thing."],
    cta: "I want this for my business →",
  },
  {
    id: "invitation",
    pos: { x: 0, y: -160 },
    lines: ["Ready to see what I can do for your business?", "Give me your website. I'll show you in 30 seconds."],
    cta: null,
  },
];

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B0713]" />}>
      <WelcomeFlow />
    </Suspense>
  );
}

function WelcomeFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isReplay = searchParams.get("replay") === "1";
  const [i, setI] = useState(0);
  const [revealAll, setRevealAll] = useState(false);
  const [dir, setDir] = useState(1);
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");

  const screen = SCREENS[i];
  const last = SCREENS.length - 1;

  // Mark onboarding complete (unless replaying).
  const complete = useCallback(async () => {
    if (isReplay) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        }).eq("id", user.id);
      }
    } catch {}
  }, [isReplay]);

  const advance = useCallback(() => {
    if (i < last) { setDir(1); setRevealAll(false); setI((n) => n + 1); }
  }, [i, last]);

  const back = useCallback(() => {
    if (i > 0) { setDir(-1); setRevealAll(false); setI((n) => n - 1); }
  }, [i]);

  // Keyboard: Enter/Space completes the stream, or advances if already complete.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Enter" || e.key === " ") {
        if (i === last) return; // invitation screen: let the input own Enter
        e.preventDefault();
        if (!revealAll) setRevealAll(true);
        else advance();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealAll, advance, i, last]);

  async function skip() {
    await complete();
    router.push("/dashboard");
  }

  async function launch() {
    const clean = url.trim();
    if (!clean) { setErr("Enter your website to continue."); return; }
    setScanning(true);
    await complete();
    // Carry the URL into the scan flow — it runs the real scan and lands
    // in-shell with results (Addition a: "wow, it actually works").
    const withProto = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    router.push(`/?scan=${encodeURIComponent(withProto)}`);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B0713] text-white flex flex-col">
      <AnimatedBackground />
      <Fireflies />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-5">
        {i > 0 ? (
          <button onClick={back} className="text-white/50 hover:text-white text-sm transition">← Back</button>
        ) : <span />}
        <div className="flex items-center gap-2">
          {SCREENS.map((_, idx) => (
            <span key={idx} className={`rounded-full transition-all duration-500 ${idx === i ? "w-5 h-1.5 bg-brand-violet" : "w-1.5 h-1.5 bg-white/25"}`} />
          ))}
        </div>
        <button onClick={skip} className="text-white/40 hover:text-white/80 text-xs transition">Skip intro</button>
      </div>

      {/* Genie orb — flies between scene positions */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 z-10"
        animate={{ x: `calc(-50% + ${screen.pos.x}px)`, y: `calc(-50% + ${screen.pos.y}px)` }}
        transition={{ type: "spring", stiffness: 60, damping: 16, mass: 1 }}
      >
        <GenieOrb size={i === last ? 68 : 96} />
      </motion.div>

      {/* Scene content */}
      <div className="relative z-10 flex-1 flex items-end justify-center pb-16 sm:pb-24 px-6">
        <div className="w-full max-w-[640px] text-center">
          {/* Scene-specific visual theater */}
          <SceneVisual id={screen.id} />

          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={screen.id}
              custom={dir}
              initial={{ opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -60 }}
              transition={{ duration: 0.5 }}
            >
              <StreamedLines lines={screen.lines} revealAll={revealAll} onDone={() => {}} />

              {/* Invitation input */}
              {i === last ? (
                <InvitationInput url={url} setUrl={setUrl} onLaunch={launch} scanning={scanning} err={err} onSkip={skip} />
              ) : (
                <CTAButton label={screen.cta} lines={screen.lines.length} revealAll={revealAll} onClick={() => (revealAll ? advance() : setRevealAll(true))} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

// ---------- Genie orb character ----------
function GenieOrb({ size = 96 }) {
  return (
    <motion.div
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      style={{
        width: size, height: size, borderRadius: "9999px",
        background: "radial-gradient(circle at 35% 30%, #A78BFA 0%, #7C3AED 45%, #6D28D9 100%)",
        boxShadow: "0 0 60px rgba(124,58,237,0.55), inset 0 0 20px rgba(255,255,255,0.25)",
      }}
    >
      <motion.div
        className="w-full h-full rounded-full"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: "radial-gradient(circle at 65% 70%, rgba(255,255,255,0.25), transparent 60%)" }}
      />
    </motion.div>
  );
}

// ---------- Streamed lines ----------
function StreamedLines({ lines, revealAll }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    let n = 0;
    const timers = [];
    lines.forEach((_, idx) => {
      timers.push(setTimeout(() => setShown(idx + 1), 400 * (idx + 1)));
    });
    return () => timers.forEach(clearTimeout);
  }, [lines]);
  useEffect(() => { if (revealAll) setShown(lines.length); }, [revealAll, lines.length]);

  return (
    <div className="space-y-3">
      {lines.map((line, idx) => (
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={idx < shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.45 }}
          className={idx === 0 ? "text-2xl sm:text-3xl font-bold leading-snug" : "text-base sm:text-lg text-white/80 leading-relaxed"}
        >
          {line}
        </motion.p>
      ))}
    </div>
  );
}

function CTAButton({ label, lines, revealAll, onClick }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), revealAll ? 100 : 400 * (lines + 1));
    return () => clearTimeout(t);
  }, [lines, revealAll]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: 0.5 }} className="mt-8">
      <button
        onClick={onClick}
        className="bg-white text-ink-900 font-semibold px-7 py-3 rounded-full hover:scale-[1.03] active:scale-95 transition shadow-lg"
        style={{ boxShadow: "0 0 30px rgba(124,58,237,0.4)" }}
      >
        {label}
      </button>
      <p className="mt-3 text-[11px] text-white/30">Press Enter to continue</p>
    </motion.div>
  );
}

function InvitationInput({ url, setUrl, onLaunch, scanning, err, onSkip }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.5 }} className="mt-8">
      <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onLaunch()}
          placeholder="yourwebsite.com"
          className="flex-1 px-5 py-3.5 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/40 outline-none focus:border-brand-violet focus:bg-white/15 transition text-center sm:text-left"
        />
        <button
          onClick={onLaunch}
          disabled={scanning}
          className="bg-white text-ink-900 font-bold px-7 py-3.5 rounded-full hover:scale-[1.03] active:scale-95 transition shadow-lg disabled:opacity-70 whitespace-nowrap"
          style={{ boxShadow: "0 0 30px rgba(124,58,237,0.5)" }}
        >
          {scanning ? "Starting…" : "Let's go →"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      <p className="mt-4 text-xs text-white/40">🔒 Private · No credit card · You'll see everything before I do anything</p>
      <button onClick={onSkip} className="mt-4 text-xs text-white/30 hover:text-white/60 underline transition">skip — take me to my dashboard</button>
    </motion.div>
  );
}

// ---------- Scene visual theater (pure illustration) ----------
function SceneVisual({ id }) {
  if (id === "diagnosis") {
    return (
      <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="mb-8 mx-auto w-56">
        <div className="relative rounded-xl bg-white/5 border border-white/15 p-3 overflow-hidden">
          <div className="flex gap-1 mb-2">{[0,1,2].map(k => <span key={k} className="w-2 h-2 rounded-full bg-white/25" />)}</div>
          <div className="space-y-1.5">
            {[70, 90, 55, 80].map((w, k) => (
              <div key={k} className="flex items-center gap-2">
                <div className="h-2 rounded bg-white/15" style={{ width: `${w}%` }} />
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1 + k * 0.4 }} className="text-emerald-400 text-xs">✓</motion.span>
              </div>
            ))}
          </div>
          <motion.div
            className="absolute left-0 right-0 h-8 bg-gradient-to-b from-brand-violet/40 to-transparent"
            animate={{ top: ["-10%", "110%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </motion.div>
    );
  }
  if (id === "plan") {
    const icons = ["📝", "🐦", "💼", "📧", "🎯", "💬"];
    return (
      <div className="mb-8 flex justify-center gap-3 flex-wrap">
        {icons.map((ic, k) => (
          <motion.div key={k} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + k * 0.15 }}
            className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-lg">{ic}</motion.div>
        ))}
      </div>
    );
  }
  if (id === "execution") {
    const plats = ["📝", "🐦", "💼", "📧"];
    return (
      <div className="mb-8 flex justify-center gap-6">
        {plats.map((p, k) => (
          <motion.div key={k} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + k * 0.2 }} className="relative">
            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-xl">{p}</div>
            <motion.div className="absolute -top-3 left-1/2 -translate-x-1/2 w-1 bg-brand-violet/60" animate={{ height: [0, 14, 0] }} transition={{ duration: 1.5, repeat: Infinity, delay: k * 0.2 }} />
          </motion.div>
        ))}
      </div>
    );
  }
  if (id === "learning") {
    return (
      <div className="mb-8 mx-auto w-56 h-20">
        <svg viewBox="0 0 200 70" className="w-full h-full">
          <motion.path d="M5,65 C50,60 90,40 130,25 S180,8 195,5" fill="none" stroke="#7C3AED" strokeWidth="2.5"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, ease: "easeInOut" }} />
          <motion.circle cx="195" cy="5" r="4" fill="#A78BFA" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.5, 1] }} transition={{ delay: 2, duration: 1.5, repeat: Infinity }} />
        </svg>
      </div>
    );
  }
  return null;
}

// ---------- Ambient background ----------
function AnimatedBackground() {
  return (
    <motion.div
      className="absolute inset-0 z-0"
      animate={{ background: [
        "radial-gradient(circle at 20% 30%, #2A1758 0%, #0B0713 55%)",
        "radial-gradient(circle at 80% 70%, #1E1B4B 0%, #0B0713 55%)",
        "radial-gradient(circle at 20% 30%, #2A1758 0%, #0B0713 55%)",
      ] }}
      transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function Fireflies() {
  const dotsRef = useRef(
    Array.from({ length: 18 }, () => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      dur: 4 + Math.random() * 5,
      delay: Math.random() * 5,
    }))
  );
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {dotsRef.current.map((d, k) => (
        <motion.span
          key={k}
          className="absolute w-1 h-1 rounded-full bg-brand-violet/60"
          style={{ left: `${d.left}%`, top: `${d.top}%` }}
          animate={{ opacity: [0, 0.8, 0], y: [0, -20, 0] }}
          transition={{ duration: d.dur, repeat: Infinity, delay: d.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
