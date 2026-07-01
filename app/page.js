"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Report } from "@/components/report";

const SCAN_STEPS = [
  "Reading your website…",
  "Checking what Google sees…",
  "Analyzing your headings & content…",
  "Checking your trust signals…",
  "Reviewing your social presence…",
  "Calculating your growth score…",
];

const FACTS = [
  "53% of visitors leave if a page takes more than 3 seconds to load.",
  "Businesses with blogs get 67% more leads than those without.",
  "88% of consumers trust online reviews as much as personal recommendations.",
  "The first result on Google gets 10x more clicks than position 10.",
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | scanning | done | error
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [stepIdx, setStepIdx] = useState(0);
  const [factIdx, setFactIdx] = useState(0);
  const timers = useRef([]);
  const [user, setUser] = useState(null);
  const [saved, setSaved] = useState(false);
  const [comparison, setComparison] = useState(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user || null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }

  useEffect(() => {
    if (phase !== "scanning") return;
    const t1 = setInterval(
      () => setStepIdx((i) => Math.min(i + 1, SCAN_STEPS.length - 1)),
      900
    );
    const t2 = setInterval(() => setFactIdx((i) => (i + 1) % FACTS.length), 3500);
    timers.current = [t1, t2];
    return () => timers.current.forEach(clearInterval);
  }, [phase]);

  async function analyze() {
    const clean = url.trim();
    if (!clean) {
      setPhase("error");
      setErrorMsg("Enter your website address to begin.");
      return;
    }
    setPhase("scanning");
    setStepIdx(0);
    setFactIdx(0);
    setData(null);
    setErrorMsg("");
    setSaved(false);
    setComparison(null);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: clean }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        setPhase("error");
        setErrorMsg(json.message || "Couldn't scan that site. Try another.");
        return;
      }
      // brief beat so the scan animation doesn't feel skipped
      setTimeout(() => {
        setData(json);
        setPhase("done");
        saveScan(json);
      }, 600);
    } catch {
      setPhase("error");
      setErrorMsg("Something interrupted the connection. Try again.");
    }
  }

  async function saveScan(result) {
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: result.url,
          finalUrl: result.finalUrl,
          scores: result.scores,
          accuracy: result.accuracy,
          checks: result.checks,
          ai: result.ai,
          speed: result.speed,
        }),
      });
      const j = await res.json();
      if (j.ok) {
        setSaved(true);
        if (j.comparison) setComparison(j.comparison);
      }
    } catch {
      // saving is best-effort; never block the result on it
    }
  }

  function reset() {
    setPhase("idle");
    setData(null);
    setErrorMsg("");
    setSaved(false);
    setComparison(null);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg genie-gradient" aria-hidden />
        <span className="font-bold tracking-tight text-genie-ink">
          Marketing Genie
        </span>
        <div className="ml-auto flex items-center gap-4">
          {phase === "done" && (
            <button
              onClick={reset}
              className="text-sm text-genie-purple font-medium hover:underline"
            >
              Scan another
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-3">
              <a
                href="/dashboard"
                className="text-sm text-genie-purple font-medium hover:underline"
              >
                My scans
              </a>
              <span className="text-sm text-genie-ink/55 hidden sm:inline">
                {user.email}
              </span>
              <button
                onClick={signOut}
                className="text-sm text-genie-ink/55 hover:text-genie-ink"
              >
                Sign out
              </button>
            </div>
          ) : (
            <a
              href="/login"
              className="text-sm text-genie-purple font-medium hover:underline"
            >
              Sign in
            </a>
          )}
        </div>
      </header>

      {phase === "idle" && (
        <Hero
          url={url}
          setUrl={setUrl}
          onAnalyze={analyze}
        />
      )}

      {phase === "error" && (
        <Hero
          url={url}
          setUrl={setUrl}
          onAnalyze={analyze}
          error={errorMsg}
        />
      )}

      {phase === "scanning" && (
        <Scanning step={SCAN_STEPS[stepIdx]} fact={FACTS[factIdx]} />
      )}

      {phase === "done" && data && (
        <Report data={data} loggedIn={!!user} saved={saved} comparison={comparison} />
      )}

      <footer className="px-6 py-6 text-center text-sm text-genie-ink/40">
        Marketing Genie · built to make growth obvious
      </footer>
    </main>
  );
}

function Hero({ url, setUrl, onAnalyze, error }) {
  return (
    <section className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-genie-purple/70">
          Your AI growth operator
        </p>
        <h1 className="mt-4 text-4xl sm:text-6xl font-extrabold tracking-tight text-genie-ink leading-[1.05]">
          Paste your URL.
          <br />
          <span className="bg-gradient-to-r from-genie-purple to-genie-emerald bg-clip-text text-transparent">
            Watch your business grow.
          </span>
        </h1>
        <p className="mt-5 text-lg text-genie-ink/70 max-w-xl mx-auto">
          Drop your website in below for a free, instant growth scan. No signup.
          No credit card.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
            placeholder="yourbusiness.com"
            className="flex-1 px-5 py-4 rounded-xl border border-genie-ink/15 bg-white text-genie-ink placeholder:text-genie-ink/40 outline-none focus:ring-2 focus:ring-genie-purple/40 transition"
            aria-label="Your website address"
          />
          <button
            onClick={onAnalyze}
            className="genie-gradient text-white font-semibold px-6 py-4 rounded-xl shadow-sm hover:shadow-md active:scale-[0.99] transition"
          >
            Scan my site →
          </button>
        </div>
        <p className="mt-4 text-sm text-genie-ink/50">
          🔒 Private · Real-time scan · Powered by a multi-AI brain
        </p>
        {error && (
          <div className="mt-6 text-left bg-amber-50 border border-amber-200 rounded-2xl p-5 max-w-xl mx-auto">
            <p className="text-amber-800">{error}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Scanning({ step, fact }) {
  return (
    <section className="flex-1 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl genie-gradient mx-auto animate-pulse" />
        <p className="mt-6 text-xl font-semibold text-genie-ink">{step}</p>
        <p className="mt-6 text-genie-ink/60 italic min-h-[3rem]">{fact}</p>
      </div>
    </section>
  );
}
