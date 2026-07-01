"use client";

import { useState, useEffect, useRef } from "react";

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
      }, 600);
    } catch {
      setPhase("error");
      setErrorMsg("Something interrupted the connection. Try again.");
    }
  }

  function reset() {
    setPhase("idle");
    setData(null);
    setErrorMsg("");
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg genie-gradient" aria-hidden />
        <span className="font-bold tracking-tight text-genie-ink">
          Marketing Genie
        </span>
        {phase === "done" && (
          <button
            onClick={reset}
            className="ml-auto text-sm text-genie-purple font-medium hover:underline"
          >
            Scan another site
          </button>
        )}
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

      {phase === "done" && data && <Report data={data} />}

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

function Report({ data }) {
  const { scores, ai, checks, finalUrl, speed, speedAvailable } = data;
  const label = scoreLabel(scores.overall);

  return (
    <section className="flex-1 px-6 pb-10">
      <div className="max-w-3xl mx-auto">
        {/* Score header */}
        <div className="text-center mt-2">
          <Ring value={scores.overall} />
          <p className="mt-2 text-lg font-semibold" style={{ color: label.color }}>
            {label.text}
          </p>
          <p className="text-sm text-genie-ink/50 break-all">{prettyHost(finalUrl)}</p>
        </div>

        {/* Sub-scores */}
        <div className="mt-8 grid sm:grid-cols-2 gap-3">
          <Bar label="🔍 SEO & Visibility" value={scores.seo} />
          <Bar label="⚡ Speed" value={scores.speed} />
          <Bar label="🛡️ Trust" value={scores.trust} />
          <Bar label="🔧 Technical" value={scores.technical} />
          <Bar label="👥 Social" value={scores.social} />
        </div>

        {/* Speed metrics */}
        {speed && (
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            <Metric label="Load (LCP)" value={speed.lcpSec != null ? speed.lcpSec + "s" : "—"} />
            <Metric label="Stability (CLS)" value={speed.cls != null ? speed.cls : "—"} />
            <Metric label="Speed" value={speed.performance + "/100"} />
          </div>
        )}
        {!speedAvailable && (
          <p className="mt-3 text-center text-xs text-genie-ink/40">
            ⚡ Speed score pending — add a PageSpeed key to measure real load time.
          </p>
        )}

        {/* Business profile + summary */}
        {ai && (
          <div className="mt-8 bg-white border border-genie-ink/10 rounded-2xl p-6 shadow-sm">
            <p className="text-sm font-semibold text-genie-purple">
              What Genie sees
            </p>
            {ai.businessName && (
              <p className="mt-2 text-genie-ink">
                <span className="font-semibold">{ai.businessName}</span>
                {ai.industry ? ` · ${ai.industry}` : ""}
              </p>
            )}
            {ai.summary && (
              <p className="mt-2 text-genie-ink/80 leading-relaxed">{ai.summary}</p>
            )}
          </div>
        )}

        {/* Top fixes */}
        {ai?.topFixes?.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-genie-ink mb-3">
              🔥 Your highest-impact fixes
            </h2>
            <div className="space-y-3">
              {ai.topFixes.map((f, i) => (
                <FixCard key={i} fix={f} n={i + 1} />
              ))}
            </div>
          </div>
        )}

        {/* Full checklist */}
        <details className="mt-8 group">
          <summary className="cursor-pointer text-genie-purple font-medium">
            See all {checks.length} checks
          </summary>
          <div className="mt-3 space-y-1">
            {checks.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-3 bg-white border border-genie-ink/10 rounded-lg px-4 py-3"
              >
                <span className="mt-0.5">{statusIcon(c.status)}</span>
                <div className="flex-1">
                  <p className="font-medium text-genie-ink text-sm">{c.label}</p>
                  <p className="text-sm text-genie-ink/60">{c.detail}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.status !== "pass" && c.difficulty && (
                      <Chip tone={difficultyTone(c.difficulty)}>{c.difficulty}</Chip>
                    )}
                    {c.status !== "pass" && c.timeToFix && c.timeToFix !== "—" && (
                      <Chip>🕒 {c.timeToFix}</Chip>
                    )}
                    {c.impactEstimate && (
                      <Chip tone="emerald">▲ {c.impactEstimate} est.</Chip>
                    )}
                    {c.confidence != null && (
                      <Chip tone="muted">{c.confidence}% confidence</Chip>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>

        <p className="mt-6 text-center text-xs text-genie-ink/40">
          Powered by Genie AI
        </p>
      </div>
    </section>
  );
}

function Ring({ value }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = scoreLabel(value).color;
  return (
    <div className="relative inline-block">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#E5E7EB" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold text-genie-ink">{value}</span>
        <span className="text-xs text-genie-ink/50">/ 100</span>
      </div>
    </div>
  );
}

function Bar({ label, value }) {
  if (value === null || value === undefined) return null;
  const color = scoreLabel(value).color;
  return (
    <div className="bg-white border border-genie-ink/10 rounded-xl px-4 py-3">
      <div className="flex justify-between text-sm font-medium text-genie-ink">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-genie-ink/10 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: color, transition: "width 1s ease" }}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-white border border-genie-ink/10 rounded-lg px-3 py-2 text-center">
      <div className="text-xs text-genie-ink/50">{label}</div>
      <div className="text-sm font-semibold text-genie-ink">{value}</div>
    </div>
  );
}

function FixCard({ fix, n }) {
  return (
    <div className="bg-white border border-genie-ink/10 rounded-2xl p-5 shadow-sm">
      <p className="font-semibold text-genie-ink">
        {n}. {fix.title}
      </p>
      {fix.whatItMeans && (
        <p className="mt-2 text-sm text-genie-ink/80">{fix.whatItMeans}</p>
      )}
      {fix.whatItCosts && (
        <p className="mt-2 text-sm text-genie-emerald font-medium">
          {fix.whatItCosts}
        </p>
      )}
      {fix.howToFix && (
        <p className="mt-2 text-sm text-genie-ink/60">
          <span className="font-medium text-genie-ink/80">How: </span>
          {fix.howToFix}
        </p>
      )}
    </div>
  );
}

function Chip({ children, tone = "default" }) {
  const tones = {
    default: "bg-genie-mist text-genie-ink/70 border-genie-ink/10",
    muted: "bg-genie-mist text-genie-ink/45 border-genie-ink/10",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span
      className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function difficultyTone(d) {
  if (d === "Easy") return "green";
  if (d === "Hard") return "red";
  return "amber";
}

function statusIcon(status) {
  if (status === "pass") return "✅";
  if (status === "warn") return "⚠️";
  return "❌";
}

function scoreLabel(v) {
  if (v >= 90) return { text: "Excellent", color: "#10B981" };
  if (v >= 75) return { text: "Good Progress", color: "#059669" };
  if (v >= 60) return { text: "Needs Attention", color: "#F59E0B" };
  if (v >= 40) return { text: "Significant Issues", color: "#F97316" };
  return { text: "Critical Problems", color: "#EF4444" };
}

function prettyHost(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}
