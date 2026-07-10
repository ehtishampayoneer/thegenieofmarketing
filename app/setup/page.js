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
    id: "google", brand: "google", power: 30, connectHref: "/api/connect/google/start",
    title: "Connect Google Search Console",
    why: "This is my superpower. With Google connected, I see exactly which keywords bring you real visitors — so I chase what actually works and drop what doesn't. Real data beats guessing every time.",
    does: "Track real keyword rankings daily · swap dead keywords for fresh ones · measure real traffic",
  },
  {
    id: "x", brand: "x", power: 20, connectHref: "/api/connect/x/start",
    title: "Connect X (Twitter)",
    why: "Hook up X and I can watch your posts perform and keep your presence alive. Your own audience is where momentum starts.",
    does: "Watch your post engagement · learn what your audience loves · build your presence",
  },
  {
    id: "wordpress", brand: "wordpress", power: 20, connectHref: null, connectView: "integrations",
    title: "Connect your blog (WordPress)",
    why: "Connect your blog and I'll publish SEO articles straight to it — for real, no copy-paste. Blog articles are your long-game ranking machine.",
    does: "Auto-publish SEO articles · build lasting Google rankings · own your content",
  },
];

// Tap-to-post platforms — no connection needed, just good to know.
const TAP_PLATFORMS = ["reddit", "quora", "linkedin", "medium"];

export default function SetupPage() {
  return <Suspense fallback={null}><Setup /></Suspense>;
}

function Setup() {
  const router = useRouter();
  const params = useSearchParams();
  const [i, setI] = useState(0);
  const [conns, setConns] = useState({}); // id -> connected?
  const [phase, setPhase] = useState("connect"); // connect | profile | done
  const [profile, setProfile] = useState({});
  const [saving, setSaving] = useState(false);

  // Load connection states so returning users see what's done.
  const loadConns = useCallback(async () => {
    try {
      const [g, x] = await Promise.all([
        fetch("/api/connect/google").then((r) => r.json()).catch(() => ({})),
        fetch("/api/connect/x").then((r) => r.json()).catch(() => ({})),
      ]);
      let wp = {};
      try { wp = await fetch("/api/connect/wordpress").then((r) => r.json()); } catch {}
      setConns({
        google: !!(g.connected || g.ok && g.email),
        x: !!x.connected,
        wordpress: !!wp.connected,
      });
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      await loadConns();
      try { const p = await fetch("/api/profile").then((r) => r.json()); if (p.ok) setProfile(p.profile || {}); } catch {}
    })();
  }, [router, loadConns]);

  // Strength = connected step weights + profile bonus.
  const connectedPower = STEPS.reduce((sum, s) => sum + (conns[s.id] ? s.power : 0), 0);
  const profilePower = profile.sender_email && profile.company_name ? 30 : profile.sender_email ? 15 : 0;
  const strength = Math.min(100, connectedPower + profilePower);

  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  function next() {
    if (!isLast) setI(i + 1);
    else setPhase("profile");
  }
  function skipAll() { setPhase("profile"); }

  async function saveProfile(markDone = true) {
    setSaving(true);
    try {
      await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, setup_completed: markDone }) });
    } catch {}
    setSaving(false);
    if (markDone) { setPhase("done"); }
  }

  return (
    <main className="min-h-screen bg-paper flex flex-col">
      {/* Top: logo + strength */}
      <div className="px-5 sm:px-8 py-5 border-b border-hairline bg-panel">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <LogoMark size={34} />
          <span className="font-bold text-ink">Marketing Genie</span>
          <button onClick={() => router.push("/dashboard")} className="ml-auto text-sm text-ink-400 hover:text-ink">Skip setup →</button>
        </div>
        <div className="max-w-2xl mx-auto mt-4">
          <StrengthBar value={strength} />
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center px-5 py-8 sm:py-12">
        <div className="w-full max-w-2xl">
          {phase === "connect" && (
            <ConnectStep
              key={step.id}
              step={step}
              connected={conns[step.id]}
              index={i}
              total={STEPS.length}
              onNext={next}
              onSkipAll={skipAll}
            />
          )}

          {phase === "profile" && (
            <ProfileStep profile={profile} setProfile={setProfile} onSave={saveProfile} saving={saving} />
          )}

          {phase === "done" && <DoneStep onGo={() => router.push("/growth?fromsetup=1")} strength={strength} />}
        </div>
      </div>
    </main>
  );
}

function ConnectStep({ step, connected, index, total, onNext, onSkipAll }) {
  const [showBody, setShowBody] = useState(false);
  return (
    <div className="animate-fade">
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-4">Step {index + 1} of {total} · Connect</p>

      <GenieLine text={step.why} onDone={() => setShowBody(true)} />

      <div className={`mt-7 transition-opacity duration-500 ${showBody ? "opacity-100" : "opacity-0"}`}>
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <BrandIcon brand={step.brand} size={24} />
            <div className="flex-1">
              <p className="font-bold text-ink">{step.title}</p>
              {connected && <p className="text-xs accent-text font-semibold">✓ Connected</p>}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {step.does.split(" · ").map((d, k) => (
              <div key={k} className="flex items-center gap-2 text-sm text-ink-600">
                <span className="accent-text"><Icon.check size={16} /></span> {d}
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3">
            {connected ? (
              <button onClick={onNext} className="btn-accent px-6 py-3 flex items-center gap-2">
                Nice! Next <Icon.arrowRight size={18} />
              </button>
            ) : (
              <>
                {step.connectHref ? (
                  <a href={step.connectHref} className="btn-ink px-6 py-3 flex items-center gap-2">
                    <Icon.connect size={18} /> Connect now
                  </a>
                ) : (
                  <a href={`/dashboard?view=${step.connectView}`} className="btn-ink px-6 py-3 flex items-center gap-2">
                    <Icon.connect size={18} /> Connect now
                  </a>
                )}
                <button onClick={onNext} className="text-sm text-ink-500 hover:text-ink font-medium">I'll do this later →</button>
              </>
            )}
          </div>
        </div>

        {index === total - 1 && (
          <div className="mt-5 card p-5 bg-accent-soft border-0">
            <p className="text-sm font-semibold text-ink">By the way — Reddit, Quora, LinkedIn & Medium need no connection at all.</p>
            <p className="text-sm text-ink-600 mt-1">I write the posts, open the page for you, and you just tap to publish. Easy. Here's what we'll work with:</p>
            <div className="flex gap-2 mt-3">
              {TAP_PLATFORMS.map((b) => <BrandIcon key={b} brand={b} size={18} />)}
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <button onClick={onSkipAll} className="text-sm text-ink-400 hover:text-ink underline">Skip the rest — take me to my profile</button>
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
      <GenieLine text="Last thing — tell me about you and your company. I'll sign every outreach email with this, so your messages always look sharp and professional. ✍️" onDone={() => setShowForm(true)} />

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
        <GenieSays text="Perfect — I'm all set up. Let's make some noise! 🎉" />
      </h1>
      <p className="mt-3 text-ink-600 max-w-md mx-auto">Next, I'll find the exact keywords to rank you on Google — then we start posting. Ready?</p>
      <div className="max-w-xs mx-auto mt-6"><StrengthBar value={strength} /></div>
      <button onClick={onGo} className="btn-ink px-8 py-3.5 mt-8 inline-flex items-center gap-2 text-base">
        Find my keywords <Icon.arrowRight size={20} />
      </button>
    </div>
  );
}
