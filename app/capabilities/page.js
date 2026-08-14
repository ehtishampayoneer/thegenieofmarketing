"use client";

// ── WHAT GENIE CAN DO (in-app) ──
// The signed-in operator's reference for everything Genie does now — grouped by
// job, each with an honest status and a link to the page where it lives. This is
// NOT the public /showcase pitch (that one has the "Hire your Genie" onboarding
// CTAs). Nothing here restarts setup; it stays inside the shell.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";
import { fetchLive } from "@/lib/live";

// tone: "live" (working now), "info" (needs a one-time connection to go real),
// "pending" (waiting on an external approval). Honest, never overstated.
const GROUPS = [
  {
    label: "UNDERSTANDS YOUR BUSINESS",
    sub: "Before it markets you, it learns what you actually sell.",
    items: [
      { icon: "scan", t: "Reads your website", p: "Scans your site, works out what you sell and who buys it, and classifies your business so every move is on-brand.", href: "/connections", status: ["live", "Active"] },
      { icon: "target", t: "Builds a keyword strategy", p: "Derives the exact buyer searches to rank for from real Google data, scored by demand vs. winnability.", href: "/growth", status: ["live", "Active"] },
    ],
  },
  {
    label: "CREATES CONTENT",
    sub: "A writer, a designer and a social team in one — nothing generic.",
    items: [
      { icon: "write", t: "Writes articles that win buyers", p: "Buyer-first answer pages and guides, human-toned, targeted at the terms your customers type.", href: "/approvals", status: ["live", "Active"] },
      { icon: "spark", t: "Designs branded post images", p: "Pulls images from your own product pages first, free stock as fallback, and composes an on-brand card for each post.", href: "/approvals", status: ["live", "Active"] },
      { icon: "conversations", t: "Social posts & carousels", p: "Instagram/LinkedIn carousels and single posts — the highest-engagement social formats — drafted ready to post.", href: "/approvals", status: ["live", "Active"] },
      { icon: "bolt", t: "Pinterest pins", p: "Tall 2:3 pins with your image, link and description, ready to save to a board in one tap.", href: "/approvals", status: ["live", "Active"] },
    ],
  },
  {
    label: "PUBLISHES & DISTRIBUTES",
    sub: "Only your own site auto-publishes. Social is draft-and-you-post, so your accounts stay safe.",
    items: [
      { icon: "growth", t: "Auto-publishes to your blog", p: "Approved articles go live on your own site (or a hosted Genie page) automatically. Connect WordPress to publish to your blog.", href: "/connections", status: ["info", "Connect blog"] },
      { icon: "search", t: "Fast Google indexing", p: "Pings the Google Indexing API + IndexNow on publish so new pages get crawled in hours, not weeks.", href: "/connections", status: ["live", "Active"] },
      { icon: "check", t: "Google Business posts", p: "For local businesses, drafts Google Business Profile posts and review requests to win the map pack.", href: "/approvals", status: ["live", "For local"] },
    ],
  },
  {
    label: "WINS SEARCH & AI ANSWERS",
    sub: "Getting found on Google — and named when buyers ask AI what to buy.",
    items: [
      { icon: "search", t: "AI Search visibility", p: "Asks ChatGPT, Perplexity, Gemini and Claude your buyers' questions, finds where a rival is named instead of you, and writes the page to win the citation.", href: "/ai-search", status: ["live", "Active"] },
      { icon: "spark", t: "Rich structured data", p: "Adds Article, Breadcrumb, HowTo and Product/Review schema so search engines and AI understand your pages.", href: "/growth", status: ["live", "Active"] },
      { icon: "history", t: "Content-refresh loop", p: "Re-optimizes your decaying winners in place — same URL — so rankings you earned don't quietly slip.", href: "/growth", status: ["live", "Active"] },
      { icon: "growth", t: "Real keyword volumes", p: "Exact monthly search volumes via the Google Ads API. Until the API token is approved, volumes show as smart estimates.", href: "/growth", status: ["pending", "Awaiting approval"] },
    ],
  },
  {
    label: "FINDS & WINS CLIENTS",
    sub: "Outbound, done for you — find the right person, pitch them, track the reply.",
    items: [
      { icon: "target", t: "Find clients", p: "Name a niche; Genie finds real companies, the decision-maker at each, their contact, and a pitch written for them.", href: "/prospects", status: ["info", "Search access setup"] },
      { icon: "mail", t: "Sends outreach for you", p: "Every email is CAN-SPAM compliant (unsubscribe + address), capped and rate-limited, sent from your own Gmail.", href: "/prospects", status: ["live", "Built-in"] },
      { icon: "inbox", t: "Inbox with threaded replies", p: "Everyone Genie emailed, threaded with their reply pulled from your Gmail, with a notification when someone answers.", href: "/inbox", status: ["info", "Grant Gmail read"] },
    ],
  },
  {
    label: "CAPTURES & MEASURES",
    sub: "Turns readers into leads, and proves the work in real numbers.",
    items: [
      { icon: "mail", t: "Email capture & lead magnet", p: "Published pages carry an opt-in so readers become leads you can follow up — not just anonymous traffic.", href: "/growth", status: ["live", "Active"] },
      { icon: "bolt", t: "Revenue attribution", p: "Point your payment provider's webhook at Genie and it traces clicks all the way to real sales.", href: "/connections", status: ["info", "Connect revenue"] },
      { icon: "growth", t: "Growth Score & impact", p: "One honest score for your organic growth, plus what Genie did each night and the customers it earned.", href: "/growth", status: ["live", "Active"] },
    ],
  },
  {
    label: "RUNS ITSELF",
    sub: "Works while you sleep; you just approve in the morning.",
    items: [
      { icon: "home", t: "Nightly autopilot", p: "Every night it finds buyers, writes, checks AI, refreshes pages and builds authority — then leaves you a short list.", href: "/today", status: ["live", "Active"] },
      { icon: "brain", t: "Learns what converts", p: "Doubles down on the topics and channels that actually earn customers. It gets smarter every day.", href: "/learning", status: ["live", "Active"] },
    ],
  },
];

const TONE = { live: "live", info: "info", pending: "neutral" };

export default function CapabilitiesPage() {
  const [counts, setCounts] = useState({ live: 0, total: 0 });

  useEffect(() => {
    let n = 0, live = 0;
    for (const g of GROUPS) for (const it of g.items) { n++; if (it.status[0] === "live") live++; }
    setCounts({ live, total: n });
  }, []);

  return (
    <OperatorShell active="capabilities">
      <div className="max-w-[1000px]">
        <p className="mg-eyebrow"><Icon.spark size={14} /> Your employee</p>
        <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(24px,2.6vw,32px)" }}>Everything Genie can do <span className="dawn-text">for you.</span></h1>
        <p className="mt-2 text-[14.5px] mg-muted max-w-[62ch]">One employee doing the work of a whole marketing team — finding buyers, creating and publishing content, winning search and AI answers, running outreach, and proving the results. <b style={{ color: "var(--fg)" }}>{counts.live}</b> of {counts.total} capabilities are active now; the rest switch on with a one-time connection.</p>

        <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px] mg-subtle">
          <span className="flex items-center gap-1.5"><span className="mg-live-dot" /> Active now</span>
          <span className="flex items-center gap-1.5"><span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--accent)", display: "inline-block" }} /> Needs a one-time connection</span>
          <span className="flex items-center gap-1.5"><span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--fg-subtle)", display: "inline-block" }} /> Awaiting external approval</span>
        </div>

        <div className="mt-7 flex flex-col gap-8">
          {GROUPS.map((g, gi) => (
            <section key={gi}>
              <p className="mg-klabel">{g.label}</p>
              <p className="mt-1 text-[13px] mg-muted max-w-[64ch]">{g.sub}</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.items.map((it, i) => {
                  const Ic = Icon[it.icon] || Icon.spark;
                  return (
                  <a key={i} href={it.href} className="mg-lift mg-focus" style={{ textDecoration: "none" }}>
                    <Card className="p-4 h-full">
                      <div className="flex items-start gap-3">
                        <span className="mg-tile shrink-0" style={{ width: 36, height: 36, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Ic size={18} /></span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{it.t}</span>
                            <span className="ml-auto"><Pill tone={TONE[it.status[0]]}>{it.status[1]}</Pill></span>
                          </div>
                          <p className="mt-1 text-[12.5px] mg-muted leading-snug">{it.p}</p>
                        </div>
                      </div>
                    </Card>
                  </a>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-9 mb-2">
          <Card className="p-5 mg-ambient">
            <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>Two things unlock the most</p>
            <p className="mt-1 text-[13px] mg-muted max-w-[64ch]">Reconnect Google to grant fast-indexing + inbox-reply access, and approve your first article so the ranking tracker, AI-search presence and refresh loop have something real to work with.</p>
            <div className="mt-3 flex items-center gap-2.5 flex-wrap">
              <a href="/connections" className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}>Reconnect Google</a>
              <a href="/approvals" className="mg-btn mg-btn--dawn" style={{ fontSize: 13 }}>Review &amp; publish →</a>
            </div>
          </Card>
        </div>
      </div>
    </OperatorShell>
  );
}
