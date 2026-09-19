"use client";

// components/today/WorkBand.js
// ── PROOF, RIGHT UNDER THE CLAIM ──
// Today says "Genie is working on your growth". This is the evidence, directly
// beneath it: the globe with the teams moving on it, and the counts that are
// actually live. A short band, not a hero — the things an owner has to *do*
// still have to be visible without scrolling.
// The full floor, the crowd's own words and the on-demand test live on /team.

import SwarmGlobe from "@/components/team/SwarmGlobe";

export default function WorkBand({ s, business = "" }) {
  // How busy each team looks follows today's real work, exactly as on /team.
  const rates = s ? {
    testers: Math.min(1, (s.testers.today || 0) / 25 + (s.waiting ? 0.3 : 0.1)),
    improvers: Math.min(1, (s.improvers.today || 0) / 10 + 0.1),
    doers: Math.min(1, (s.doers.today || 0) / 30 + 0.15),
  } : { testers: 0.3, improvers: 0.2, doers: 0.3 };
  const counts = s?.live ? { testers: s.live.testers.active, improvers: s.live.improvers.active, doers: s.live.doers.active } : null;

  return (
    <div>
      <SwarmGlobe compact height="clamp(190px, 26vh, 270px)" rates={rates} counts={counts} business={business} />
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap px-1">
        <p className="text-[12.5px] mg-subtle">
          {s
            ? <>1,000 simulated customers, 7 improvers and 9 engines{s.waiting ? ` · ${s.waiting} draft${s.waiting === 1 ? "" : "s"} queued for tonight` : ""}. {s.ai ? "Full crowd testing." : "Every free AI is busy — quick checks for now."}</>
            : "Counting what your team did…"}
        </p>
        <a href="/team" className="text-[12.5px] font-semibold mg-focus shrink-0" style={{ color: "var(--accent-ink)" }}>Your team →</a>
      </div>
    </div>
  );
}
