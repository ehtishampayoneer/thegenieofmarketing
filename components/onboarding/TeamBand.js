"use client";

// components/onboarding/TeamBand.js
// ── "AND I DON'T WORK ALONE" ──
// The band on the reveal page, the moment right after the scan. This is where an
// owner decides whether Genie is a writing tool or a workforce, so it shows the
// team rather than a feature list. The numbers are what the system actually runs:
// 1,000 simulated customers per test, 7 improver specialists, 9 nightly engines
// (lib/swarm). If those change, change them here too.

const TEAM = [
  { c: "#2EE6C5", n: "1,000", t: "simulated customers", p: "Built from your business and from what your real buyers say online. They read every article, post, pitch and email before you do, argue over it, and tell me exactly what they would object to." },
  { c: "#FFB347", n: "7", t: "improvers", p: "Every objection becomes a job: proof, price clarity, the opening line, the platform's rules. They rewrite it, a panel picks the best version, and the crowd re-tests the winner." },
  { c: "#A78BFA", n: "9", t: "engines, every night", p: "Writing, publishing to your own domain, finding buyers and places to get featured, checking your real Google rankings, chasing the links you earned. You wake up to a short list." },
];

const POWERS = [
  "Articles on your own domain", "Real Google rankings", "Buyer Hunt", "Get featured",
  "Listed on G2 & Product Hunt", "Named in AI answers", "Outreach from your Gmail", "Test it before you launch",
];

export default function TeamBand({ business = "" }) {
  return (
    <div className="lg:col-span-2 mt-14">
      <p className="text-[12px] font-semibold" style={{ textTransform: "uppercase", letterSpacing: ".14em", color: "var(--onb-subtle)" }}>And I don&apos;t work alone</p>
      <h2 className="mt-2.5 font-bold tracking-tight" style={{ fontSize: "clamp(26px,3.4vw,40px)", lineHeight: 1.08, letterSpacing: "-.028em", textWrap: "balance" }}>
        A team of <span style={{ color: "var(--onb-dawn)" }}>1,016</span> starts on {business || "your business"} tonight.
      </h2>
      <p className="mt-3 text-[15px]" style={{ color: "var(--onb-muted)", maxWidth: "var(--measure)", lineHeight: 1.55 }}>
        Nothing goes out untested. Your customers are simulated first, so the things that would have been ignored, or reported as spam, never reach the real ones.
      </p>

      <div className="mt-7 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))" }}>
        {TEAM.map((x) => (
          <div key={x.t} style={{ borderRadius: 18, padding: "22px 20px", background: "var(--onb-panel)", border: "1px solid var(--onb-hair)", boxShadow: `inset 0 3px 0 ${x.c}` }}>
            <p className="flex items-baseline gap-2">
              <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.03em", color: "var(--onb-fg)", lineHeight: 1 }}>{x.n}</span>
              <span className="text-[14px] font-semibold" style={{ color: x.c }}>{x.t}</span>
            </p>
            <p className="mt-2.5 text-[14px]" style={{ color: "var(--onb-muted)", lineHeight: 1.5 }}>{x.p}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2 flex-wrap">
        {POWERS.map((t) => (
          <span key={t} className="text-[12.5px]" style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--onb-hair2)", color: "var(--onb-muted)" }}>{t}</span>
        ))}
      </div>
      <p className="mt-5 text-[13px]" style={{ color: "var(--onb-subtle)" }}>
        Every one of them works while you sleep. You approve in the morning, and your accounts are never put at risk.
      </p>
    </div>
  );
}
