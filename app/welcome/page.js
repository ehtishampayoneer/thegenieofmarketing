"use client";

// ── GENIE ONBOARDING — meeting an intelligent AI employee ──
// One system: the Aperture (Genie), the dawn/bokeh field (background), and
// depth-of-field focus as hierarchy. Show, don't tell — headline + ≤1 line per
// scene; the rest is demonstrated. No emoji. Genie EXPRESSES through behavior.

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import Genie from "@/components/genie/Genie";
import AuroraBackground from "@/components/premium/AuroraBackground";
import { GlassPanel, GradientText } from "@/components/premium/Glass";
import { GlyphArticle, GlyphSocial, GlyphOutreach, GlyphAd, GlyphSearch, GlyphChart, GlyphCommunity } from "@/components/premium/Glyphs";

const SCENES = [
  { id: "arrival",   genie: "listening",   headline: "I'm Genie.",                    line: "Your first AI marketing employee.",           cta: "Meet me" },
  { id: "diagnosis", genie: "scanning",    headline: "I see what's holding you back.", line: "One scan. Everything that matters.",          cta: "Then what" },
  { id: "plan",      genie: "working",     headline: "I build your growth plan.",     line: "Made for your business — not a template.",     cta: "Then what" },
  { id: "execution", genie: "working",     headline: "I do the work.",                line: "You approve. I execute — from your accounts.", cta: "And growth" },
  { id: "learning",  genie: "discovering", headline: "I compound your growth.",       line: "I learn from everything, and adjust.",         cta: "Show me" },
  { id: "invitation",genie: "listening",   headline: "Show me your website.",         line: "I'll show you in thirty seconds.",             cta: null },
];

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-night-950" />}>
      <Welcome />
    </Suspense>
  );
}

function Welcome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isReplay = searchParams.get("replay") === "1";
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");

  const scene = SCENES[i];
  const last = SCENES.length - 1;

  const complete = useCallback(async () => {
    if (isReplay) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from("profiles").update({ onboarding_completed: true, onboarding_completed_at: new Date().toISOString() }).eq("id", user.id);
    } catch {}
  }, [isReplay]);

  const advance = useCallback(() => { if (i < last) { setDir(1); setI((n) => n + 1); } }, [i, last]);
  const back = useCallback(() => { if (i > 0) { setDir(-1); setI((n) => n - 1); } }, [i]);

  useEffect(() => {
    function onKey(e) {
      if ((e.key === "Enter" || e.key === " ") && i !== last) { e.preventDefault(); advance(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, i, last]);

  async function skip() { await complete(); router.push("/dashboard"); }
  async function launch() {
    const clean = url.trim();
    if (!clean) { setErr("Enter your website to continue."); return; }
    setScanning(true);
    await complete();
    const withProto = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    router.push(`/?scan=${encodeURIComponent(withProto)}`);
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-moon-100 flex flex-col">
      <AuroraBackground intensity={i === last ? 0.8 : 1} />

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-6">
        {i > 0 ? <button onClick={back} className="text-moon-400 hover:text-moon-100 text-sm transition">← Back</button> : <span />}
        <div className="flex items-center gap-2">
          {SCENES.map((_, idx) => (
            <motion.span key={idx} className="rounded-full bg-white/20" animate={{ width: idx === i ? 26 : 6, backgroundColor: idx === i ? "#A78BFA" : "rgba(255,255,255,0.2)" }} style={{ height: 6 }} transition={{ duration: 0.4 }} />
          ))}
        </div>
        <button onClick={skip} className="text-moon-500 hover:text-moon-300 text-xs transition">Skip</button>
      </div>

      {/* Genie — persists across scenes, only changes behavior */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 -mt-6">
        <motion.div layout animate={{ scale: i === last ? 0.8 : 1 }} transition={{ type: "spring", stiffness: 90, damping: 18 }}>
          <Genie state={scene.genie} size={148} />
        </motion.div>

        {/* Scene-specific demonstration sits inside the aperture's field */}
        <div className="h-24 mt-2 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div key={scene.id + "-vis"} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.4 }}>
              <SceneVisual id={scene.id} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Text — minimal, big, confident */}
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={scene.id}
            custom={dir}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            className="mt-4 flex flex-col items-center text-center"
          >
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]" style={{ filter: "drop-shadow(0 2px 20px rgba(124,58,237,0.35))" }}>
              <GradientText>{scene.headline}</GradientText>
            </h1>
            <p className="mt-4 text-lg sm:text-xl text-moon-100/90 font-medium max-w-md">{scene.line}</p>

            {i === last ? (
              <Invitation url={url} setUrl={setUrl} onLaunch={launch} scanning={scanning} err={err} onSkip={skip} />
            ) : (
              <motion.button
                onClick={advance}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                className="mt-10 rounded-full px-9 py-4 font-semibold text-night-950"
                style={{ background: "linear-gradient(120deg,#F5F3FF,#C4B5FD)", boxShadow: "0 0 44px rgba(124,58,237,0.5)" }}
              >
                {scene.cta} →
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 pb-6 text-center text-[11px] text-moon-500">
        {i !== last && <span className="text-moon-400">Press Enter to continue</span>}
      </div>
    </main>
  );
}

function Invitation({ url, setUrl, onLaunch, scanning, err, onSkip }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-9 w-full max-w-md">
      <GlassPanel glow className="p-2 flex flex-col sm:flex-row gap-2">
        <input
          autoFocus value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onLaunch()}
          placeholder="yourwebsite.com"
          className="flex-1 bg-transparent px-4 py-3 text-moon-100 placeholder-moon-500 outline-none text-center sm:text-left"
        />
        <motion.button onClick={onLaunch} disabled={scanning} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
          className="rounded-2xl px-6 py-3 font-bold text-white disabled:opacity-70 whitespace-nowrap"
          style={{ background: "linear-gradient(135deg,#7C3AED,#4F46E5)", boxShadow: "0 8px 24px rgba(124,58,237,0.45)" }}>
          {scanning ? "Focusing…" : "Let's go →"}
        </motion.button>
      </GlassPanel>
      {err && <p className="mt-2 text-sm text-red-300 text-center">{err}</p>}
      <p className="mt-4 text-xs text-moon-300 text-center">Private · No credit card · You see everything first</p>
      <button onClick={onSkip} className="mt-3 w-full text-center text-xs text-moon-300 hover:text-white underline transition">skip — take me to my dashboard</button>
    </motion.div>
  );
}

// ── Scene demonstrations — SHOW, don't tell. All custom, no emoji. ──
function SceneVisual({ id }) {
  if (id === "diagnosis") return <ScanDemo />;
  if (id === "plan") return <PlanDemo />;
  if (id === "execution") return <ExecutionDemo />;
  if (id === "learning") return <GrowthDemo />;
  return null;
}

function ScanDemo() {
  return (
    <GlassPanel className="w-56 p-3 overflow-hidden">
      <div className="space-y-1.5 relative">
        {[80, 55, 92, 48].map((w, k) => (
          <div key={k} className="flex items-center gap-2">
            <div className="h-1.5 rounded-full bg-white/20 flex-1" style={{ maxWidth: `${w}%` }} />
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + k * 0.3 }} className="text-emerald-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
            </motion.span>
          </div>
        ))}
        <motion.div className="absolute left-0 right-0 h-8 pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(167,139,250,0.4), transparent)" }}
          animate={{ top: ["-20%", "120%"] }} transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }} />
      </div>
    </GlassPanel>
  );
}

function PlanDemo() {
  const items = [GlyphArticle, GlyphSocial, GlyphOutreach, GlyphAd, GlyphSearch];
  return (
    <div className="flex gap-2">
      {items.map((G, k) => (
        <motion.div key={k} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * k, type: "spring", stiffness: 140 }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-white/10 border border-white/20 shadow-glow-soft"><G size={22} /></div>
        </motion.div>
      ))}
    </div>
  );
}

function ExecutionDemo() {
  const items = [GlyphArticle, GlyphSocial, GlyphOutreach, GlyphAd];
  return (
    <div className="flex gap-4">
      {items.map((G, k) => (
        <div key={k} className="relative">
          <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12 * k }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-white/10 border border-white/20 shadow-glow-soft"><G size={22} /></div>
          </motion.div>
          <motion.div className="absolute left-1/2 -top-5 w-0.5 -translate-x-1/2"
            style={{ background: "linear-gradient(180deg, transparent, #A78BFA)" }}
            animate={{ height: [0, 18, 0], opacity: [0, 1, 0] }} transition={{ duration: 1.5, repeat: Infinity, delay: k * 0.18 }} />
        </div>
      ))}
    </div>
  );
}

function GrowthDemo() {
  return (
    <GlassPanel className="w-56 h-16 p-2 flex items-center text-moon-200">
      <svg viewBox="0 0 220 50" className="w-full h-full">
        <motion.path d="M6,44 C50,40 90,26 130,18 S196,6 214,4" fill="none" stroke="url(#gd)" strokeWidth="2.5" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: "easeInOut" }} />
        <defs><linearGradient id="gd" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#7C3AED" /><stop offset="100%" stopColor="#FBA678" /></linearGradient></defs>
        <motion.circle cx="214" cy="4" r="3.5" fill="#FBA678" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.6, 1] }} transition={{ delay: 1.6, duration: 1.4, repeat: Infinity }} />
      </svg>
    </GlassPanel>
  );
}
