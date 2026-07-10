"use client";

// ── WAVE 2A: THE GUIDED SETUP ──
// After the scan, Genie walks the user through connecting accounts one by one,
// explaining (in his own writing-animated voice) why each adds power, with a
// strength bar that grows as they go. Skippable. Ends by capturing the company/
// sender profile that gets baked into outreach emails. Fun, warm, alive.

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/ui/Logo";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { GenieSays, GenieLine, StrengthBar } from "@/components/ui/GenieVoice";
import Icon from "@/components/ui/Icon";

// Each step's power weight + Genie's pitch.
const STEPS = [
  {
    id: "google", brand: "google", power: 35, kind: "oauth", connectHref: "/api/connect/google/start",
    title: "Connect Google Search Console",
    why: "SEO is old, but it's still gold. Knowing your keywords is what makes you show up when people search on Google. Connect Google and I'll find which keyword could become your superpower, then track it climbing every day.",
    does: "See your real keyword rankings, spot which keywords bring visitors, and know exactly what's working",
  },
  {
    id: "x", brand: "x", power: 12, kind: "oauth", connectHref: "/api/connect/x/start",
    title: "Connect X (Twitter)",
    why: "X is where conversations move fast. I'll post to your account daily to build your audience, and I'll also hunt down posts related to what you do so you can jump in and get noticed. Fresh discoveries every single day.",
    does: "Post daily to build your following, find related conversations to join, and grow your reach",
  },
  {
    id: "wordpress", brand: "wordpress", power: 12, kind: "inapp", connectView: "integrations",
    title: "Connect your blog",
    why: "Blogs are your long game. I'll publish fresh articles regularly, woven with your keywords so every post links back to your strengths and climbs Google over time. Real content that keeps working for you.",
    does: "Publish keyword-rich articles, build lasting Google rankings, and grow content that compounds",
  },
  {
    id: "reddit", brand: "reddit", power: 10, kind: "signin", signinUrl: "https://www.reddit.com/login",
    title: "Sign in to Reddit",
    why: "Reddit is pure gold. Real people are already talking about exactly what you offer. I'll post from your account and find the best conversations to join, so you show up where it counts. You just tap to publish.",
    does: "Join the hottest threads, post value that builds trust, and get discovered by real buyers",
  },
  {
    id: "quora", brand: "quora", power: 8, kind: "signin", signinUrl: "https://www.quora.com/",
    title: "Sign in to Quora",
    why: "On Quora, people literally ask the questions your product answers. I'll write sharp answers that help them and rank on Google too. Two wins from one tap.",
    does: "Answer high-intent questions, rank on Google, and win trust from ready-to-buy people",
  },
  {
    id: "linkedin", brand: "linkedin", power: 8, kind: "signin", signinUrl: "https://www.linkedin.com/login",
    title: "Sign in to LinkedIn",
    why: "LinkedIn is where the money scrolls. Investors, founders, decision-makers. I'll craft posts that make you look sharp and put you in front of the people who can actually move the needle for you.",
    does: "Post polished updates, reach decision-makers and investors, and grow your professional pull",
  },
];

const TAP_PLATFORMS = ["reddit", "quora", "linkedin", "medium"];

export default function SetupPage() {
  return <Suspense fallback={null}><Setup /></Suspense>;
}

function Setup() {
  const router = useRouter();
  const params = useSearchParams();
  const [i, setI] = useState(0);
  const [conns, setConns] = useState({}); // id -> connected?
  const [signedIn, setSignedIn] = useState({}); // signin steps the user confirmed
  const [phase, setPhase] = useState("connect");
  const [profile, setProfile] = useState({});
  const [saving, setSaving] = useState(false);

  const loadConns = useCallback(async () => {
    try {
      const [g, x] = await Promise.all([
        fetch("/api/connect/google").then((r) => r.json()).catch(() => ({})),
        fetch("/api/connect/x").then((r) => r.json()).catch(() => ({})),
      ]);
      let wp = {};
      try { wp = await fetch("/api/connect/wordpress").then((r) => r.json()); } catch {}
      setConns({ google: !!g.connected, x: !!x.connected, wordpress: !!wp.connected });
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      await loadConns();
      try { const p = await fetch("/api/profile").then((r) => r.json()); if (p.ok) setProfile(p.profile || {}); } catch {}
      // restore signed-in marks
      try { const s = JSON.parse(localStorage.getItem("genie_signedin") || "{}"); setSignedIn(s); } catch {}
      // resume after an OAuth return
      const connected = params.get("connected");
      if (connected) {
        const idx = STEPS.findIndex((s) => s.id === connected);
        if (idx >= 0) setI(Math.min(idx + 1, STEPS.length - 1));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, loadConns]);

  const isDone = (s) => (s.kind === "signin" ? !!signedIn[s.id] : !!conns[s.id]);
  const connectedPower = STEPS.reduce((sum, s) => sum + (isDone(s) ? s.power : 0), 0);
  const profilePower = profile.sender_email && profile.company_name ? 15 : profile.sender_email ? 8 : 0;
  const strength = Math.min(100, connectedPower + profilePower);

  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  function beginConnect(s) {
    // Remember to return to setup after OAuth.
    document.cookie = "genie_return=setup; path=/; max-age=600; samesite=lax";
    if (s.kind === "oauth") { window.location.href = s.connectHref; }
    else if (s.kind === "inapp") { document.cookie = "genie_return=setup; path=/; max-age=600"; router.push(`/dashboard?view=${s.connectView}`); }
    else if (s.kind === "signin") {
      window.open(s.signinUrl, "_blank");
      const ns = { ...signedIn, [s.id]: true };
      setSignedIn(ns);
      try { localStorage.setItem("genie_signedin", JSON.stringify(ns)); } catch {}
    }
  }

  function next() { if (!isLast) setI(i + 1); else setPhase("profile"); }
  function skipAll() { setPhase("profile"); }

  async function saveProfile(markDone = true) {
    setSaving(true);
    try {
      await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, setup_completed: markDone }) });
    } catch {}
    setSaving(false);
    if (markDone) setPhase("done");
  }

  return (
    <main className="min-h-screen bg-paper flex flex-col">
      <div className="px-5 sm:px-8 py-5 border-b border-hairline bg-panel">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <LogoMark size={34} />
          <span className="font-bold text-ink">Marketing Genie</span>
          <button onClick={() => router.push("/dashboard")} className="ml-auto text-sm text-ink-400 hover:text-ink">Skip setup →</button>
        </div>
        <div className="max-w-2xl mx-auto mt-4"><StrengthBar value={strength} /></div>
      </div>

      <div className="flex-1 flex items-start justify-center px-5 py-8 sm:py-12">
        <div className="w-full max-w-2xl">
          {phase === "connect" && (
            <ConnectStep key={step.id} step={step} done={isDone(step)} index={i} total={STEPS.length} onConnect={() => beginConnect(step)} onNext={next} onSkipAll={skipAll} />
          )}
          {phase === "profile" && <ProfileStep profile={profile} setProfile={setProfile} onSave={saveProfile} saving={saving} />}
          {phase === "done" && <DoneStep onGo={() => router.push("/growth?fromsetup=1")} strength={strength} />}
        </div>
      </div>
    </main>
  );
}

function ConnectStep({ step, done, index, total, onConnect, onNext, onSkipAll }) {
  const [showBody, setShowBody] = useState(false);
  const verb = step.kind === "signin" ? "Sign in" : "Connect now";
  return (
    <div className="animate-fade">
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-4">Step {index + 1} of {total}</p>

      <GenieLine text={step.why} onDone={() => setShowBody(true)} />

      <div className={`mt-7 transition-opacity duration-500 ${showBody ? "opacity-100" : "opacity-0"}`}>
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <BrandIcon brand={step.brand} size={24} />
            <div className="flex-1">
              <p className="font-bold text-ink">{step.title}</p>
              {done && <p className="text-xs accent-text font-semibold">✓ Added to your system</p>}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {step.does.split(", ").map((d, k) => (
              <div key={k} className="flex items-center gap-2 text-sm text-ink-600">
                <span className="accent-text"><Icon.check size={16} /></span> {d}
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3">
            {done ? (
              <button onClick={onNext} className="btn-accent px-6 py-3 flex items-center gap-2">
                {index === total - 1 ? "Finish" : "Nice! Next"} <Icon.arrowRight size={18} />
              </button>
            ) : (
              <>
                <button onClick={onConnect} className="btn-ink px-6 py-3 flex items-center gap-2">
                  <Icon.connect size={18} /> {verb}
                </button>
                <button onClick={onNext} className="text-sm text-ink-500 hover:text-ink font-medium">I'll do this later →</button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <button onClick={onSkipAll} className="text-sm text-ink-400 hover:text-ink underline">Skip the rest, take me to my profile</button>
        </div>
      </div>
    </div>
  );
}

function ProfileStep({ profile, setProfile, onSave, saving }) {
  const [showForm, setShowForm] = useState(false);
  function upd(k, v) { setProfile((p) => ({ ...p, [k]: v })); }
  const fields = [
    ["sender_name", "Your name", "Alex Carter"],
    ["sender_email", "Email you'll send from", "alex@yourcompany.com"],
    ["company_name", "Company name", "HOLOS"],
    ["company_website", "Website", "holos.app"],
    ["company_phone", "Phone (optional)", "+1 555 0100"],
    ["company_address", "Address (optional)", "San Francisco, CA"],
    ["company_pitch", "One-line pitch", "Shop products in AR before you buy."],
  ];
  return (
    <div className="animate-fade">
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-4">Almost there · Your profile</p>
      <GenieLine text="Last thing. Tell me about you and your company, and I'll sign every outreach email with these details so your messages always look sharp and professional." onDone={() => setShowForm(true)} />

      <div className={`mt-7 transition-opacity duration-500 ${showForm ? "opacity-100" : "opacity-0"}`}>
        <div className="card p-6 space-y-4">
          {fields.map(([k, label, ph]) => (
            <div key={k}>
              <label className="text-xs font-semibold text-ink-500">{label}</label>
              <input
                value={profile[k] || ""}
                onChange={(e) => upd(k, e.target.value)}
                placeholder={ph}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-hairline bg-paper text-ink outline-none focus:border-ink-300 transition"
              />
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button onClick={() => onSave(true)} disabled={saving} className="btn-ink px-6 py-3 flex items-center gap-2 disabled:opacity-50">
            {saving ? "Saving…" : <>Save & let's go <Icon.arrowRight size={18} /></>}
          </button>
          <button onClick={() => onSave(true)} className="text-sm text-ink-500 hover:text-ink">Skip for now</button>
        </div>
      </div>
    </div>
  );
}

function DoneStep({ onGo, strength }) {
  return (
    <div className="text-center animate-scale-in py-8">
      <div className="inline-block mb-4"><LogoMark size={64} /></div>
      <h1 className="text-3xl font-extrabold text-ink">
        <GenieSays text="Perfect. I'm all set up. Let's make some noise!" />
      </h1>
      <p className="mt-3 text-ink-600 max-w-md mx-auto">Next, I'll find the exact keywords to rank you on Google, then we start posting. Ready?</p>
      <div className="max-w-xs mx-auto mt-6"><StrengthBar value={strength} /></div>
      <button onClick={onGo} className="btn-ink px-8 py-3.5 mt-8 inline-flex items-center gap-2 text-base">
        Find my keywords <Icon.arrowRight size={20} />
      </button>
    </div>
  );
}
