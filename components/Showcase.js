"use client";

// ── The Showcase — Genie's cinematic pitch ──
// Two modes from one component:
//   • standalone (default) — the public /showcase page (marketing CTAs).
//   • embedded — shown inside onboarding right after the URL is entered; its CTAs
//     become "continue", so the pitch flows straight into the rest of setup.
// Committed to one visual world on purpose: the night Genie works in, lit by
// dawn-gold, emerald for winning. Scroll-choreographed; reduced-motion safe.

import { useEffect, useRef } from "react";

export function Showcase({ embedded = false, onContinue = () => {}, host = "" }) {
  const root = useRef(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const runCounters = (scope) => {
      scope.querySelectorAll("[data-count]").forEach((n) => {
        if (n.dataset.done) return; n.dataset.done = "1";
        const to = parseFloat(n.dataset.count); const dec = (n.dataset.count.split(".")[1] || "").length;
        const pre = n.dataset.pre || ""; const suf = n.dataset.suf || "";
        if (reduce) { n.textContent = pre + to.toFixed(dec) + suf; return; }
        const dur = 1300; const t0 = performance.now();
        const tick = (t) => {
          const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 3);
          n.textContent = pre + (to * e).toFixed(dec) + suf;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("in"); runCounters(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.28 });

    el.querySelectorAll("[data-reveal]").forEach((n) => {
      if (reduce) { n.classList.add("in"); runCounters(n); } else io.observe(n);
    });
    return () => io.disconnect();
  }, []);

  const cleanHost = String(host || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  return (
    <main className="sx" ref={root}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── HERO ── */}
      <header className="sx-hero">
        <div className="sx-aura" aria-hidden />
        <nav className="sx-nav">
          <span className="sx-logo"><Gem size={26} /> Marketing <b>Genie</b></span>
          {embedded
            ? <button type="button" className="sx-nav-cta sx-nav-btn" onClick={onContinue}>Continue to setup →</button>
            : <a className="sx-nav-cta" href="/welcome">Hire your employee →</a>}
        </nav>
        <div className="sx-hero-in" data-reveal>
          <p className="sx-kicker"><span className="sx-dot" /> Your AI marketing employee</p>
          <h1 className="sx-h1">Stop paying for ads.<br /><span className="sx-gold">Hire the marketing that brings you customers.</span></h1>
          <p className="sx-lede">Genie finds your buyers, writes what wins them, publishes it, gets it seen, and shows you the customers it earned — organically, every single day. You just approve.</p>
          <div className="sx-cta-row">
            {embedded
              ? <button type="button" className="sx-btn sx-btn-gold" onClick={onContinue}>{cleanHost ? `See what I found for ${cleanHost} →` : "Continue →"}</button>
              : <>
                  <a className="sx-btn sx-btn-gold" href="/verdict">See what AI says about you →</a>
                  <a className="sx-btn sx-btn-ghost" href="/welcome">Meet your employee</a>
                </>}
          </div>
          {embedded && <p className="sx-hero-hint">Take the tour, or continue whenever you like — I’m already scanning your site.</p>}
          <Ticker />
        </div>
      </header>

      {/* ── THE TRANSFORMATION ── */}
      <section className="sx-sec">
        <SecLabel n="01" t="What changes when Genie goes to work" />
        <div className="sx-transform" data-reveal>
          <div className="sx-chart-card">
            <div className="sx-chart-head">
              <div>
                <p className="sx-eyebrow">Your organic growth</p>
                <p className="sx-chart-sub">Traffic, rankings & AI mentions — before and after</p>
              </div>
              <span className="sx-chip sx-chip-live">▲ compounding</span>
            </div>
            <GrowthChart />
            <div className="sx-legend">
              <span><i className="sx-sw" style={{ background: "var(--dim)" }} /> Before Genie — flat, invisible</span>
              <span><i className="sx-sw" style={{ background: "var(--emerald)" }} /> After Genie — climbing, every day</span>
            </div>
          </div>
          <div className="sx-stat-col">
            <StatTile pre="" count="34" suf="%" label="of AI answers now name you" tone="gold" note="Was 0%. Genie writes the pages that win the citation." />
            <StatTile pre="" count="41" suf="" label="customers Genie earned you" tone="emerald" note="Real people, traced back to the work — not vanity metrics." />
            <StatTile pre="+" count="18" suf="" label="Google places climbed" tone="gold" note="Winnable searches first, then the big ones." />
          </div>
        </div>
      </section>

      {/* ── THE AI ANSWER WAR ── */}
      <section className="sx-sec sx-sec-tight">
        <SecLabel n="02" t="The war nobody else is fighting" />
        <div className="sx-war" data-reveal>
          <div>
            <h2 className="sx-h2">When your buyers ask AI what to buy,<br /><span className="sx-gold">do they hear your name — or your rival’s?</span></h2>
            <p className="sx-p">More people ask ChatGPT and Perplexity for recommendations than ever. Genie is built to win that answer — it asks the real models what they say about you, finds the gaps, and writes the pages that get you cited.</p>
            {!embedded && <a className="sx-link" href="/verdict">Run your free AI Verdict →</a>}
          </div>
          <div className="sx-war-panel">
            <p className="sx-eyebrow">Share of AI answers that name you</p>
            <div className="sx-warbar"><i className="sx-warfill" style={{ "--w": "34%" }} /></div>
            <div className="sx-war-row"><span>You</span><span className="sx-mono sx-emerald" data-count="34" data-suf="%">0%</span></div>
            <div className="sx-war-vs">AI still points them to <b>a competitor</b> in the other 66%. Genie is going after that, every night.</div>
          </div>
        </div>
      </section>

      {/* ── CONTENT THAT GETS TRACTION ── */}
      <section className="sx-sec">
        <SecLabel n="03" t="Content that actually gets read" />
        <p className="sx-sec-sub">A glimpse of what Genie ships for you — and the traction it earns. Illustrative of how the product works.</p>
        <div className="sx-posts" data-reveal>
          <PostCard brand="Answer page" title="The honest guide to choosing cold brew concentrate" meta="Published to your blog · indexed in 3 hours" a="2,140" al="readers" b="34" bl="AI citations" tone="gold" />
          <PostCard brand="Reddit" title="Replied in r/coffee — value first, never an ad" meta="Genie drafted it · you tapped post" a="248" al="upvotes" b="61" bl="comments" tone="emerald" />
          <PostCard brand="X / Twitter" title="A thread on what makes a cold brew smooth" meta="Auto-posted to your account" a="512" al="likes" b="89" bl="reposts" tone="gold" />
          <PostCard brand="Outreach" title="Personalized pitch to a buying-guide editor" meta="Drafted for your approval — earns the backlink" a="7" al="replies" b="3" bl="links won" tone="emerald" />
        </div>
      </section>

      {/* ── EVERYTHING GENIE DOES ── */}
      <section className="sx-sec">
        <SecLabel n="04" t="A whole marketing team — in one employee" />
        <div className="sx-caps" data-reveal>
          {CAPS.map((c, i) => (
            <div className="sx-cap" key={i} style={{ transitionDelay: `${i * 55}ms` }}>
              <span className="sx-cap-ic">{c.icon}</span>
              <h3 className="sx-cap-t">{c.t}</h3>
              <p className="sx-cap-p">{c.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="sx-sec sx-sec-tight">
        <SecLabel n="05" t="You do almost nothing" />
        <div className="sx-steps" data-reveal>
          {STEPS.map((s, i) => (
            <div className="sx-step" key={i}>
              <span className="sx-step-n">{i + 1}</span>
              <div>
                <h3 className="sx-step-t">{s.t}</h3>
                <p className="sx-step-p">{s.p}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CLOSE ── */}
      <section className="sx-close" data-reveal>
        <div className="sx-aura sx-aura-2" aria-hidden />
        <h2 className="sx-close-h">The only marketing that <span className="sx-gold">pays you back.</span></h2>
        <p className="sx-close-p">No ad budget. No agency. Just an employee that works every night and brings you customers. Point it at your website and watch it go.</p>
        {embedded
          ? <button type="button" className="sx-btn sx-btn-gold sx-btn-lg" onClick={onContinue}>Continue — set me up →</button>
          : <a className="sx-btn sx-btn-gold sx-btn-lg" href="/welcome">Hire your Genie — free →</a>}
        <p className="sx-close-sub">Free to start · nothing publishes without your approval</p>
      </section>
    </main>
  );
}

function Ticker() {
  const items = [
    "Writing an answer page: “best cold brew subscription”",
    "Found 3 buyers asking on Reddit right now",
    "AI now names you in 2 more buyer answers",
    "Published to your blog — indexed in hours",
    "A tagged link just converted — $310",
  ];
  return (
    <div className="sx-ticker" aria-hidden>
      <div className="sx-ticker-track">
        {[...items, ...items].map((t, i) => (
          <span className="sx-ticker-item" key={i}><span className="sx-dot" /> {t}</span>
        ))}
      </div>
    </div>
  );
}

function GrowthChart() {
  const W = 640, H = 240, pad = 14;
  const pts = [8, 9, 8, 10, 9, 11, 10, 12, 20, 34, 52, 74, 96, 128, 168, 214];
  const max = 230;
  const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const flat = pts.slice(0, 8).map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const gx = x(8);
  return (
    <svg className="sx-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Organic growth climbing after Genie starts">
      <defs>
        <linearGradient id="sxfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--emerald)" stopOpacity="0.30" />
          <stop offset="100%" stopColor="var(--emerald)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} className="sx-grid" />)}
      <path className="sx-area" d={area} fill="url(#sxfill)" />
      <path className="sx-flat" d={flat} />
      <path className="sx-line" d={line} />
      <line className="sx-mark" x1={gx} x2={gx} y1={pad} y2={H - pad} />
      <circle className="sx-tip" cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="4.5" />
      <text className="sx-marktxt" x={gx + 6} y={pad + 12}>Genie starts</text>
    </svg>
  );
}

function StatTile({ pre = "", count, suf = "", label, tone, note }) {
  return (
    <div className={`sx-stat sx-stat-${tone}`}>
      <p className="sx-stat-n sx-mono"><span data-count={count} data-pre={pre} data-suf={suf}>{pre}0{suf}</span></p>
      <p className="sx-stat-l">{label}</p>
      <p className="sx-stat-note">{note}</p>
    </div>
  );
}

function PostCard({ brand, title, meta, a, al, b, bl, tone }) {
  return (
    <div className={`sx-post sx-post-${tone}`}>
      <span className="sx-post-brand">{brand}</span>
      <p className="sx-post-title">{title}</p>
      <p className="sx-post-meta">{meta}</p>
      <div className="sx-post-eng">
        <span><b className="sx-mono" data-count={a.replace(/,/g, "")}>{a}</b> {al}</span>
        <span><b className="sx-mono" data-count={b}>{b}</b> {bl}</span>
      </div>
    </div>
  );
}

function SecLabel({ n, t }) {
  return (
    <div className="sx-seclabel" data-reveal>
      <span className="sx-seclabel-n sx-mono">{n}</span>
      <h2 className="sx-seclabel-t">{t}</h2>
      <span className="sx-seclabel-rule" />
    </div>
  );
}

function Gem({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ verticalAlign: "middle" }}>
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--gold)" strokeWidth="6" opacity=".4" />
      <circle cx="50" cy="50" r="26" fill="none" stroke="var(--gold)" strokeWidth="6" opacity=".7" />
      <circle cx="50" cy="50" r="9" fill="var(--gold)" />
    </svg>
  );
}

const CAPS = [
  { icon: "◎", t: "Understands your business", p: "Scans your site, learns what you sell, and interviews you so every move is on-brand." },
  { icon: "⌕", t: "Finds your buyers", p: "Hunts the exact searches and live conversations where people are ready to buy what you sell." },
  { icon: "✎", t: "Writes what wins", p: "Buyer-first articles, social posts, and answers — human-toned, never generic filler." },
  { icon: "▲", t: "Publishes anywhere", p: "Your blog or a hosted page, X, email — and gets it indexed in hours, not weeks." },
  { icon: "✦", t: "Wins the AI answer", p: "Gets you named when buyers ask ChatGPT, Perplexity and Gemini what to buy." },
  { icon: "$", t: "Turns readers into customers", p: "Tracks every click to a real sale, so you see the money — not just traffic." },
  { icon: "◈", t: "Learns from what works", p: "Doubles down on the topics and channels that actually convert. It gets smarter daily." },
  { icon: "☾", t: "Runs itself, all night", p: "Every night it works; every morning you get a short list to approve. That’s it." },
];

const STEPS = [
  { t: "Point it at your website", p: "One link. In seconds it reads your site and shows you what it sees." },
  { t: "It investigates your business", p: "A quick interview so it markets the real you — not a homepage guess." },
  { t: "It works every night", p: "Finds buyers, writes, publishes, checks AI, builds authority — on autopilot." },
  { t: "You approve — customers arrive", p: "Tap to approve the work. Watch the rankings climb and the customers land." },
];

const CSS = `
.sx{--ink:#05070E;--panel:#0C1119;--panel2:#131A26;--fg:#F4F8FC;--muted:#AAB8C6;--subtle:#6E7C8B;
  --gold:#FFC876;--gold2:#F49A3C;--emerald:#4FE0A6;--dim:#3A4658;--hair:rgba(255,255,255,.08);--hair2:rgba(255,255,255,.05);
  position:relative;min-height:100vh;background:var(--ink);color:var(--fg);overflow-x:hidden;
  font-family:"Geist","Inter",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5;}
.sx *{box-sizing:border-box}
.sx-mono{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
.sx-gold{background:linear-gradient(96deg,#FFE7BE,var(--gold) 45%,var(--gold2));-webkit-background-clip:text;background-clip:text;color:transparent}
.sx-emerald{color:var(--emerald)} .sx-dot{width:7px;height:7px;border-radius:999px;background:var(--emerald);display:inline-block;box-shadow:0 0 0 0 rgba(79,224,166,.5);animation:sxpulse 2s ease infinite}
@keyframes sxpulse{0%{box-shadow:0 0 0 0 rgba(79,224,166,.45)}70%{box-shadow:0 0 0 7px rgba(79,224,166,0)}100%{box-shadow:0 0 0 0 rgba(79,224,166,0)}}
.sx [data-reveal]{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.2,.8,.2,1),transform .7s cubic-bezier(.2,.8,.2,1)}
.sx [data-reveal].in{opacity:1;transform:none}
.sx-hero{position:relative;padding:0 22px 40px;min-height:92vh;display:flex;flex-direction:column;overflow:hidden}
.sx-aura{position:absolute;inset:0;pointer-events:none;z-index:0;background:
  radial-gradient(50% 40% at 78% 4%,rgba(255,200,118,.16),transparent 60%),
  radial-gradient(46% 40% at 8% 0%,rgba(84,132,214,.12),transparent 62%),
  radial-gradient(120% 80% at 50% -10%,#0B1120 0%,var(--ink) 60%)}
.sx-aura-2{background:radial-gradient(60% 70% at 50% 30%,rgba(255,200,118,.12),transparent 65%)}
.sx-nav{position:relative;z-index:2;max-width:1120px;margin:0 auto;width:100%;display:flex;align-items:center;justify-content:space-between;padding:26px 0}
.sx-logo{font-size:15px;font-weight:700;letter-spacing:-.01em;display:inline-flex;align-items:center;gap:9px} .sx-logo b{color:var(--gold);font-weight:800}
.sx-nav-cta{font-size:13.5px;font-weight:600;color:var(--fg);text-decoration:none;padding:9px 16px;border-radius:11px;border:1px solid var(--hair);transition:.2s}
.sx-nav-btn{background:none;cursor:pointer;font-family:inherit}
.sx-nav-cta:hover{border-color:rgba(255,200,118,.4);background:rgba(255,200,118,.06)}
.sx-hero-in{position:relative;z-index:2;max-width:900px;margin:auto;text-align:center;padding:24px 0}
.sx-kicker{display:inline-flex;align-items:center;gap:9px;font-size:13px;font-weight:600;color:var(--muted);padding:7px 14px;border-radius:999px;border:1px solid var(--hair);background:rgba(255,255,255,.02)}
.sx-h1{font-size:clamp(38px,6.4vw,74px);line-height:1.02;letter-spacing:-.035em;font-weight:800;margin:22px 0 0;text-wrap:balance}
.sx-lede{font-size:clamp(16px,2vw,20px);color:var(--muted);max-width:60ch;margin:20px auto 0;line-height:1.55}
.sx-hero-hint{font-size:13px;color:var(--subtle);margin-top:16px}
.sx-cta-row{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:34px}
.sx-btn{display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;padding:15px 26px;border-radius:14px;text-decoration:none;transition:transform .15s,filter .2s,box-shadow .2s;border:none;cursor:pointer;font-family:inherit}
.sx-btn-lg{font-size:16.5px;padding:18px 34px}
.sx-btn-gold{background:linear-gradient(135deg,#FFDDA3,var(--gold) 55%,var(--gold2));color:#241606;box-shadow:0 14px 40px rgba(255,175,80,.28),0 1px 0 rgba(255,255,255,.4) inset}
.sx-btn-gold:hover{transform:translateY(-2px);filter:brightness(1.05)}
.sx-btn-ghost{color:var(--fg);border:1px solid var(--hair);background:rgba(255,255,255,.02)} .sx-btn-ghost:hover{border-color:rgba(255,255,255,.25)}
.sx-ticker{margin-top:48px;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.sx-ticker-track{display:flex;gap:40px;width:max-content;animation:sxscroll 34s linear infinite}
.sx-ticker-item{display:inline-flex;align-items:center;gap:9px;font-size:13.5px;color:var(--subtle);white-space:nowrap}
@keyframes sxscroll{to{transform:translateX(-50%)}}
.sx-sec{position:relative;z-index:2;max-width:1120px;margin:0 auto;padding:clamp(60px,9vw,120px) 22px 0}
.sx-sec-tight{padding-top:clamp(40px,6vw,80px)}
.sx-seclabel{display:flex;align-items:center;gap:16px;margin-bottom:34px}
.sx-seclabel-n{font-size:13px;font-weight:700;color:var(--gold);letter-spacing:.1em}
.sx-seclabel-t{font-size:clamp(20px,2.6vw,28px);font-weight:750;letter-spacing:-.02em;text-wrap:balance}
.sx-seclabel-rule{flex:1;height:1px;background:linear-gradient(90deg,var(--hair),transparent)}
.sx-sec-sub{color:var(--muted);font-size:15px;margin:-18px 0 26px;max-width:64ch}
.sx-h2{font-size:clamp(24px,3.4vw,38px);line-height:1.1;letter-spacing:-.025em;font-weight:800;text-wrap:balance}
.sx-p{color:var(--muted);font-size:16px;line-height:1.6;margin-top:16px;max-width:52ch}
.sx-eyebrow{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--subtle)}
.sx-link{display:inline-block;margin-top:18px;color:var(--gold);font-weight:700;font-size:15px;text-decoration:none;border-bottom:1px solid rgba(255,200,118,.4);padding-bottom:2px}
.sx-transform{display:grid;grid-template-columns:1.5fr 1fr;gap:20px}
@media(max-width:900px){.sx-transform{grid-template-columns:1fr}}
.sx-chart-card{background:linear-gradient(180deg,rgba(255,255,255,.03),transparent),var(--panel);border:1px solid var(--hair);border-radius:20px;padding:24px}
.sx-chart-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.sx-chart-sub{color:var(--muted);font-size:13px;margin-top:3px}
.sx-chip{font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:999px}
.sx-chip-live{color:var(--emerald);background:rgba(79,224,166,.13)}
.sx-svg{width:100%;height:240px;display:block;overflow:visible}
.sx-grid{stroke:var(--hair2);stroke-width:1}
.sx-flat{fill:none;stroke:var(--dim);stroke-width:2.5;stroke-linecap:round}
.sx-line{fill:none;stroke:var(--emerald);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1400;stroke-dashoffset:1400;transition:stroke-dashoffset 1.9s cubic-bezier(.3,.7,.2,1) .15s}
.sx-transform.in .sx-line{stroke-dashoffset:0}
.sx-area{opacity:0;transition:opacity 1s ease .9s} .sx-transform.in .sx-area{opacity:1}
.sx-mark{stroke:var(--gold);stroke-width:1.5;stroke-dasharray:4 5;opacity:0;transition:opacity .6s ease 1s} .sx-transform.in .sx-mark{opacity:.6}
.sx-marktxt{fill:var(--gold);font-size:11px;font-weight:600;opacity:0;transition:opacity .6s ease 1.1s} .sx-transform.in .sx-marktxt{opacity:.9}
.sx-tip{fill:var(--emerald);opacity:0;transition:opacity .4s ease 1.9s} .sx-transform.in .sx-tip{opacity:1}
.sx-legend{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;font-size:12.5px;color:var(--muted)}
.sx-legend span{display:inline-flex;align-items:center;gap:8px} .sx-sw{width:11px;height:3px;border-radius:2px;display:inline-block}
.sx-stat-col{display:flex;flex-direction:column;gap:14px}
.sx-stat{background:var(--panel);border:1px solid var(--hair);border-radius:18px;padding:20px 22px;flex:1;display:flex;flex-direction:column;justify-content:center}
.sx-stat-gold{border-color:rgba(255,200,118,.22)} .sx-stat-emerald{border-color:rgba(79,224,166,.22)}
.sx-stat-n{font-size:clamp(34px,4vw,46px);font-weight:800;letter-spacing:-.03em;line-height:1}
.sx-stat-gold .sx-stat-n{color:var(--gold)} .sx-stat-emerald .sx-stat-n{color:var(--emerald)}
.sx-stat-l{font-size:14.5px;color:var(--fg);font-weight:600;margin-top:8px}
.sx-stat-note{font-size:12.5px;color:var(--subtle);margin-top:6px;line-height:1.45}
.sx-war{display:grid;grid-template-columns:1.15fr 1fr;gap:36px;align-items:center}
@media(max-width:900px){.sx-war{grid-template-columns:1fr}}
.sx-war-panel{background:linear-gradient(180deg,rgba(255,200,118,.05),transparent),var(--panel);border:1px solid rgba(255,200,118,.2);border-radius:20px;padding:26px}
.sx-warbar{height:16px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:14px}
.sx-warfill{display:block;height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,var(--gold2),var(--emerald));box-shadow:0 0 24px rgba(255,200,118,.4);transition:width 1.4s cubic-bezier(.3,.7,.2,1) .2s}
.sx-war.in .sx-warfill{width:var(--w)}
.sx-war-row{display:flex;justify-content:space-between;align-items:baseline;margin-top:12px;font-size:14px;color:var(--muted)} .sx-war-row .sx-mono{font-size:26px;font-weight:800}
.sx-war-vs{margin-top:14px;font-size:13.5px;color:var(--subtle);line-height:1.5} .sx-war-vs b{color:var(--fg)}
.sx-posts{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
@media(max-width:900px){.sx-posts{grid-template-columns:repeat(2,1fr)}}
@media(max-width:540px){.sx-posts{grid-template-columns:1fr}}
.sx-post{background:var(--panel);border:1px solid var(--hair);border-radius:16px;padding:18px;display:flex;flex-direction:column;min-height:170px;transition:transform .2s,border-color .2s}
.sx-post:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.18)}
.sx-post-brand{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--gold)}
.sx-post-emerald .sx-post-brand{color:var(--emerald)}
.sx-post-title{font-size:15px;font-weight:650;line-height:1.35;margin-top:10px;flex:1}
.sx-post-meta{font-size:12px;color:var(--subtle);margin-top:8px;line-height:1.4}
.sx-post-eng{display:flex;gap:16px;margin-top:14px;padding-top:12px;border-top:1px solid var(--hair2);font-size:12.5px;color:var(--muted)}
.sx-post-eng b{color:var(--fg);font-weight:800;font-size:15px;margin-right:3px}
.sx-post-emerald .sx-post-eng b{color:var(--emerald)} .sx-post-gold .sx-post-eng b{color:var(--gold)}
.sx-caps{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
@media(max-width:900px){.sx-caps{grid-template-columns:repeat(2,1fr)}}
@media(max-width:540px){.sx-caps{grid-template-columns:1fr}}
.sx-cap{background:linear-gradient(180deg,rgba(255,255,255,.03),transparent),var(--panel);border:1px solid var(--hair);border-radius:16px;padding:20px;transition:transform .2s,border-color .2s,box-shadow .2s}
.sx-cap:hover{transform:translateY(-3px);border-color:rgba(255,200,118,.3);box-shadow:0 18px 40px rgba(0,0,0,.4)}
.sx-cap-ic{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;background:rgba(255,200,118,.12);color:var(--gold);font-size:20px;font-weight:700}
.sx-cap-t{font-size:15.5px;font-weight:700;margin-top:14px;letter-spacing:-.01em}
.sx-cap-p{font-size:13px;color:var(--muted);margin-top:6px;line-height:1.5}
.sx-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:900px){.sx-steps{grid-template-columns:1fr;gap:12px}}
.sx-step{display:flex;gap:14px;align-items:flex-start;background:var(--panel);border:1px solid var(--hair);border-radius:16px;padding:20px}
.sx-step-n{flex:none;width:30px;height:30px;border-radius:999px;background:linear-gradient(135deg,var(--gold),var(--gold2));color:#241606;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:14px}
.sx-step-t{font-size:15px;font-weight:700;letter-spacing:-.01em}
.sx-step-p{font-size:13px;color:var(--muted);margin-top:5px;line-height:1.5}
.sx-close{position:relative;z-index:2;text-align:center;max-width:760px;margin:0 auto;padding:clamp(80px,12vw,150px) 22px clamp(70px,10vw,110px);overflow:hidden}
.sx-close-h{position:relative;z-index:2;font-size:clamp(30px,5.2vw,58px);line-height:1.05;letter-spacing:-.03em;font-weight:800;text-wrap:balance}
.sx-close-p{position:relative;z-index:2;color:var(--muted);font-size:17px;line-height:1.6;margin:20px auto 0;max-width:52ch}
.sx-close .sx-btn{position:relative;z-index:2;margin-top:32px}
.sx-close-sub{position:relative;z-index:2;margin-top:16px;font-size:13px;color:var(--subtle)}
@media(prefers-reduced-motion:reduce){
  .sx [data-reveal]{opacity:1;transform:none;transition:none}
  .sx-line,.sx-area,.sx-mark,.sx-marktxt,.sx-tip,.sx-warfill{transition:none}
  .sx-line{stroke-dashoffset:0}.sx-ticker-track{animation:none}.sx-dot{animation:none}.sx-warfill{width:var(--w)}
}
`;
