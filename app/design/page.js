"use client";

// ── /design — the living design language of Marketing Genie V2 ──
// Milestone 1 preview. Self-contained (mock data only) so it always renders on
// Vercel. This page IS the spec: it shows the Aperture, the Dawn identity, the
// Day/Night themes, typography, the honesty system, core components, and the
// core interaction (the Approval Queue) — the answer to the one morning
// question: "What did Genie do while I was away, and what do I need to approve?"

import { useState } from "react";
import Aperture, { ApertureMark } from "@/components/brand/Aperture";
import {
  Card, QuietCard, Button, Pill, Kbd, SectionLabel, Stat, Verified, Estimated, Divider,
} from "@/components/ui/v2/primitives";

export default function DesignLanguagePage() {
  const [theme, setTheme] = useState("day");
  return (
    <div className="mg min-h-screen" data-theme={theme === "night" ? "night" : undefined}
         style={{ fontFamily: "var(--font-ui)" }}>
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-6 py-3.5"
              style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--hair)" }}>
        <ApertureMark size={26} />
        <span className="font-bold tracking-tight">Marketing Genie</span>
        <span className="mg-subtle text-xs hidden sm:inline">V2 · Aperture design language</span>
        <div className="ml-auto flex items-center gap-1 mg-surface-quiet p-1" style={{ borderRadius: 999 }}>
          {["day", "night"].map((t) => (
            <button key={t} onClick={() => setTheme(t)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full transition"
              style={ theme === t ? { background: "var(--primary)", color: "var(--on-primary)" } : { color: "var(--fg-muted)" } }>
              {t === "day" ? "Day" : "Night"}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-[1080px] mx-auto px-6 pb-28">
        {/* ── HERO: the morning reveal ── */}
        <section className="mg-rise mt-10 rounded-[28px] overflow-hidden relative" data-theme="night"
                 style={{ background: "var(--bg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-3)" }}>
          <div className="absolute inset-0 pointer-events-none"
               style={{ background: "radial-gradient(120% 90% at 82% -10%, rgba(255,200,118,.18), transparent 55%)" }} />
          <div className="relative px-8 py-12 sm:px-14 sm:py-16" style={{ color: "var(--fg)" }}>
            <div className="flex items-start gap-6 flex-col sm:flex-row sm:items-center">
              <Aperture state="working" size={124} />
              <div>
                <SectionLabel>Good morning · 7:12am</SectionLabel>
                <h1 className="mt-2 text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
                  While you slept,<br /><span className="dawn-text">Genie got to work.</span>
                </h1>
                <p className="mt-4 text-base sm:text-lg" style={{ color: "var(--fg-muted)", maxWidth: 520 }}>
                  I scanned 41 conversations, wrote 6 replies in your voice, published 2 posts to
                  your own accounts, and found 3 people actively looking for what you do.
                </p>
              </div>
            </div>

            <div className="mt-9 grid grid-cols-2 sm:grid-cols-4 gap-5">
              <Stat value="41" label="conversations scanned" />
              <Stat value="6" label="replies drafted" />
              <Stat value="2" label="posts published" accent />
              <Stat value="+3" label="live rank climbs" accent />
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button variant="dawn" className="text-base px-5 py-3.5">
                Review 3 approvals
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Button>
              <Button variant="ghost">See everything Genie ran</Button>
              <span className="mg-subtle text-xs ml-1">or press <Kbd>⌘</Kbd> <Kbd>K</Kbd></span>
            </div>
          </div>
        </section>

        <p className="mt-8 text-center text-sm mg-muted max-w-xl mx-auto">
          Marketing Genie isn’t a collection of tools. It’s an AI employee. The whole product answers
          one question every morning — and everything else gets out of the way.
        </p>

        {/* ── IDENTITY ── */}
        <Block title="The identity" sub="Ink & Paper are the canvas. Dawn is the light Genie casts. Emerald means done.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Swatch name="Ink" hex="#11202E" fg="#F6F5F1" note="Primary · text & structure" />
            <Swatch name="Paper" hex="#F6F5F1" fg="#11202E" note="Canvas · calm, warm, quiet" border />
            <Swatch name="Dawn" hex="#F59E3D" fg="#2C1B05" note="Signature · the morning light" />
            <Swatch name="Emerald" hex="#1E9E6A" fg="#FFFFFF" note="Signal · live / winning / done" />
          </div>
        </Block>

        {/* ── APERTURE STATES ── */}
        <Block title="Genie’s presence" sub="One mark, four moods. State is expressed through motion — never a face.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[["idle", "Resting"], ["working", "Working"], ["thinking", "Thinking"], ["discovering", "Found something"]].map(([s, l]) => (
              <Card key={s} className="p-6 flex flex-col items-center gap-4">
                <Aperture state={s} size={84} />
                <div className="text-center">
                  <p className="font-semibold text-sm capitalize">{s}</p>
                  <p className="mg-subtle text-xs mt-0.5">{l}</p>
                </div>
              </Card>
            ))}
          </div>
        </Block>

        {/* ── TYPE ── */}
        <Block title="Typography" sub="A confident scale. Restrained weights. Tabular numerals wherever data lives.">
          <Card className="p-8 space-y-4">
            <p className="text-4xl font-extrabold tracking-tight">Growth, handled overnight.</p>
            <p className="text-2xl font-bold tracking-tight">Section heading — the work</p>
            <p className="text-lg font-semibold">Card title, calm and clear</p>
            <p className="text-base" style={{ color: "var(--fg-muted)", maxWidth: 560 }}>
              Body copy sits at a comfortable measure and a generous line-height so a tired founder
              can read it at 7am. No jargon, no shouting.
            </p>
            <p className="mg-num text-sm mg-subtle">1,284 clicks · #4.2 avg rank · 92/100 · +18% est.</p>
          </Card>
        </Block>

        {/* ── HONESTY SYSTEM ── */}
        <Block title="Honesty as a visual language" sub="Every number says whether it’s measured or estimated. Trust is the product.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <span className="mg-num text-3xl font-bold">1,284</span>
                <Verified />
              </div>
              <p className="mg-muted text-sm mt-1">Clicks · from Google Search Console</p>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <span className="mg-num text-3xl font-bold">~$2.4k</span>
                <Estimated />
              </div>
              <p className="mg-muted text-sm mt-1">Monthly opportunity · Genie’s inference</p>
            </Card>
          </div>
        </Block>

        {/* ── COMPONENTS ── */}
        <Block title="Components" sub="One vocabulary, token-driven, identical in Day and Night.">
          <Card className="p-7 space-y-6">
            <Row label="Buttons">
              <Button variant="dawn">Approve</Button>
              <Button variant="primary">Publish</Button>
              <Button variant="ghost">Edit draft</Button>
              <Button variant="quiet">Skip</Button>
            </Row>
            <Divider />
            <Row label="Signals">
              <Pill tone="live">● Live</Pill>
              <Pill tone="dawn">Ready to post</Pill>
              <Pill tone="info">Drafted</Pill>
              <Pill tone="danger">Needs attention</Pill>
              <Pill>Reddit</Pill>
            </Row>
            <Divider />
            <Row label="Metrics">
              <Stat value="92" label="site health" />
              <Stat value="8" label="winning threads" accent />
              <Stat value="41" label="keywords tracked" />
            </Row>
          </Card>
        </Block>

        {/* ── THE CORE INTERACTION: APPROVAL QUEUE ── */}
        <Block title="The one interaction that matters" sub="Everything Genie drafts flows into a single, keyboard-driven approval queue.">
          <Card className="overflow-hidden">
            <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--hair)" }}>
              <Aperture state="idle" size={30} halo={false} />
              <div className="flex-1">
                <p className="font-semibold text-sm">3 things need you</p>
                <p className="mg-subtle text-xs">Owned accounts first, then communities · Genie already wrote them</p>
              </div>
              <span className="mg-num mg-subtle text-xs">1 / 3</span>
            </div>

            <div className="p-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Pill>Reddit · r/SaaS</Pill>
                <Pill tone="dawn">🎯 analytics for founders</Pill>
                <Estimated>~40 in the thread now</Estimated>
              </div>
              <h3 className="mt-3 text-lg font-bold tracking-tight">
                Answer a founder asking how to choose analytics without overpaying
              </h3>
              <QuietCard className="mt-3 p-4">
                <p className="text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  “Honestly it depends on the questions you’re trying to answer, not the tool. If you
                  just need to know what’s working, start with the free tier of one thing and only
                  upgrade when a real decision is blocked. I’ve been using {""}
                  <span style={{ color: "var(--fg)", fontWeight: 600 }}>your product</span> for the
                  attribution side and it’s been enough without the enterprise bill…”
                </p>
              </QuietCard>
              <p className="mg-subtle text-xs mt-2">Why this fits: they’re comparing tools right now and your positioning is “no enterprise bill.” Genuine, not an ad.</p>

              <div className="mt-5 flex items-center gap-2.5 flex-wrap">
                <Button variant="dawn">Approve &amp; post <span className="mg-kbd" style={{ marginLeft: 4 }}>A</span></Button>
                <Button variant="ghost">Edit <span className="mg-kbd" style={{ marginLeft: 4 }}>E</span></Button>
                <Button variant="quiet">Skip <span className="mg-kbd" style={{ marginLeft: 4 }}>S</span></Button>
                <span className="mg-subtle text-xs ml-auto hidden sm:flex items-center gap-1">
                  <Kbd>←</Kbd> <Kbd>→</Kbd> to move
                </span>
              </div>
            </div>
          </Card>
        </Block>

        {/* ── CONVERSATION STORY ── */}
        <Block title="Every conversation, told as a story" sub="Found → wrote → posted → winning. Genie keeps watching so it never goes cold.">
          <Card className="p-6">
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="font-bold text-sm">r/marketing · “what actually moved your traffic?”</span>
              <Pill tone="live">● Live</Pill>
              <Pill tone="dawn">📈 Winning</Pill>
            </div>
            <ol className="relative pl-6" style={{ borderLeft: "2px solid var(--hair)" }}>
              {[
                ["Found the opening", "Genie spotted a thread matching your strongest keyword", "var(--accent)"],
                ["Wrote your reply", "A genuinely helpful answer in your voice", "var(--accent)"],
                ["You approved & posted", "2 days ago", "var(--signal-live)"],
                ["Traction", "34 upvotes · 11 replies · Genie drafted 4 follow-ups", "var(--signal-live)"],
              ].map(([t, d, c], i) => (
                <li key={i} className="mb-4 last:mb-0 relative">
                  <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full" style={{ background: c, boxShadow: "0 0 0 3px var(--surface)" }} />
                  <p className="font-semibold text-sm">{t}</p>
                  <p className="mg-subtle text-xs mt-0.5">{d}</p>
                </li>
              ))}
            </ol>
          </Card>
        </Block>

        <footer className="mt-16 text-center">
          <ApertureMark size={22} className="inline-block" />
          <p className="mg-subtle text-xs mt-2">Marketing Genie V2 · Aperture design language · Milestone 1 — Foundation &amp; Identity</p>
        </footer>
      </main>
    </div>
  );
}

/* ---- local layout helpers (page-scoped) ---- */
function Block({ title, sub, children }) {
  return (
    <section className="mt-14">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {sub && <p className="mg-muted text-sm mt-1 max-w-2xl">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="mg-subtle text-xs w-20 shrink-0">{label}</span>
      <div className="flex items-center gap-3 flex-wrap">{children}</div>
    </div>
  );
}

function Swatch({ name, hex, fg, note, border }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <div className="h-24 flex items-end p-3" style={{ background: hex, color: fg, ...(border ? { boxShadow: "inset 0 0 0 1px rgba(0,0,0,.04)" } : {}) }}>
        <span className="font-bold">{name}</span>
      </div>
      <div className="p-3" style={{ background: "var(--surface)" }}>
        <p className="mg-num text-xs font-semibold">{hex}</p>
        <p className="mg-subtle text-[11px] mt-0.5">{note}</p>
      </div>
    </div>
  );
}
