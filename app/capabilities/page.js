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
      { icon: "brain", t: "Original, citable content", p: "Every article is pushed to add real ‘information gain’ — not generic AI rehash. For genuine originality it weaves in YOUR first-party facts (your data, process, proof, expert take) — add them once in Settings and every article gets markedly more citable. That’s what Google ranks and AI cites in 2026.", href: "/settings", status: ["live", "Automatic"] },
      { icon: "spark", t: "Designs branded post images", p: "Pulls images from your own product pages first, free stock as fallback, and composes an on-brand card for each post.", href: "/approvals", status: ["live", "Active"] },
      { icon: "conversations", t: "Social posts & carousels", p: "Instagram/LinkedIn carousels and single posts — the highest-engagement social formats — drafted ready to post.", href: "/approvals", status: ["live", "Active"] },
      { icon: "bolt", t: "Pinterest pins", p: "Tall 2:3 pins with your image, link and description, ready to save to a board in one tap.", href: "/approvals", status: ["live", "Active"] },
      { icon: "conversations", t: "Reddit posts & Quora answers", p: "Drafts value-first Reddit self-posts and Quora answers in your voice; Reddit opens the submit page prefilled and you post.", href: "/approvals", status: ["draft", "You post"] },
    ],
  },
  {
    label: "PUBLISHES & DISTRIBUTES",
    sub: "Only your own site auto-publishes. Social is draft-and-you-post, so your accounts stay safe.",
    items: [
      { icon: "growth", t: "Auto-publishes to your blog", p: "Approved articles go live on your own site (or a hosted Genie page) automatically. Connect WordPress to publish to your blog.", href: "/connections", status: ["info", "Connect blog"] },
      { icon: "search", t: "Fast indexing", p: "On publish, instantly pings IndexNow (Bing & Yandex — which ChatGPT Search and Perplexity read) and requests a Google crawl, so pages get discovered in hours instead of waiting for a slow first crawl. (Google indexing is requested, never guaranteed.)", href: "/connections", status: ["live", "Active"] },
      { icon: "link", t: "Internal-link acceleration", p: "Each new page auto-gets links from 2–3 of your older, already-indexed pages — a whitehat trick that gets it found in days and passes it ranking strength.", href: "/growth", status: ["live", "Automatic"] },
      { icon: "check", t: "Google Business posts", p: "For local businesses, drafts Google Business Profile posts and review requests to win the map pack.", href: "/approvals", status: ["live", "For local"] },
      { icon: "target", t: "Local service optimizer", p: "For local businesses: writes city-tagged Google Business service names (‘Roman Shades Austin’) + ~300-char descriptions that win ‘near me’ searches. You paste them into your profile.", href: "/growth", status: ["live", "For local"] },
    ],
  },
  {
    label: "WINS SEARCH & AI ANSWERS",
    sub: "Getting found on Google — and named when buyers ask AI what to buy.",
    items: [
      { icon: "search", t: "AI Search visibility", p: "Asks ChatGPT, Perplexity, Gemini and Claude your buyers' questions, finds where a rival is named instead of you, and writes a better, more source-worthy answer page to improve your odds of being the one AI cites.", href: "/ai-search", status: ["live", "Active"] },
      { icon: "spark", t: "Rich structured data", p: "Adds Article, Breadcrumb, HowTo and Product/Review schema so search engines and AI understand your pages.", href: "/growth", status: ["live", "Active"] },
      { icon: "history", t: "Content-refresh loop", p: "Re-optimizes your decaying winners in place — same URL — so rankings you earned don't quietly slip.", href: "/growth", status: ["live", "Active"] },
      { icon: "growth", t: "Real keyword volumes", p: "Real search-volume ranges from the Google Ads API (the same data advertisers use). Until the API token is approved, volumes show as smart estimates.", href: "/growth", status: ["pending", "Awaiting approval"] },
      { icon: "brain", t: "llms.txt + AI-crawler access", p: "Auto-built AI content index at /llms.txt (plus /llms-full.txt with every page's full text), and a robots.txt that explicitly welcomes GPTBot, PerplexityBot and ClaudeBot. Note: Google has said it doesn't use llms.txt, so this is for AI assistants that do — not a Google ranking lever.", href: "/growth", status: ["live", "Active"] },
      { icon: "write", t: "Clean markdown for AI", p: "Every published page also has a clean, plain-markdown twin (no menus or clutter) that AI engines read far more reliably — making your business easier to quote in AI answers.", href: "/growth", status: ["live", "Automatic"] },
      { icon: "target", t: "Topic hubs (pillar pages)", p: "When you have several related articles, Genie assembles an authoritative hub page linking them all together (and links each back) — the hub-and-spoke structure Google reads as topical authority.", href: "/growth", status: ["live", "Active"] },
      { icon: "conversations", t: "Answers real ‘People Also Ask’", p: "Harvests the actual questions people type into Google about your topic (free) and answers them in each article’s FAQ with schema — exactly what AI answer engines quote.", href: "/approvals", status: ["live", "Automatic"] },
      { icon: "check", t: "Google Preferred Sources", p: "Auto-adds Google's official Preferred Sources button to every published page (and your own site), boosting Top Stories + AI Overviews.", href: "/growth", status: ["live", "Active"] },
      { icon: "globe", t: "Website readiness audit", p: "Scans your own website and hands you exact copy-paste fixes — titles, meta, structured-data badges, sitemap, and FAQ schema — so everything Genie builds ranks faster. You paste them in; Genie never edits your site.", href: "/site", status: ["live", "Active"] },
      { icon: "megaphone", t: "Finds new-country markets", p: "Ranks countries you can genuinely serve where demand is real and competition is thin — using your real Search Console country data — then drafts a localized page to test each as a tracked 30-day experiment.", href: "/markets", status: ["live", "Active"] },
    ],
  },
  {
    label: "HUNTS BUYERS & CLOSES DEALS",
    sub: "The money layer — catch people ready to buy, win them, and see the revenue.",
    items: [
      { icon: "crosshair", t: "Buyer Hunt", p: "Scans Hacker News, Software Recs, GitHub, Reddit and Quora for people asking to buy right now, scores each 0–100, and drafts the reply. Name your rivals to poach their unhappy users.", href: "/hunt", status: ["live", "Active"] },
      { icon: "coins", t: "Revenue Recovery", p: "Upload your old leads & customers; Genie writes a specific win-back for each and you send from your Gmail. Warm contacts convert in days.", href: "/recover", status: ["live", "Fast money"] },
      { icon: "board", t: "Deal Pipeline", p: "One board across every channel: reached → replied (each reply classified for you) → won, with the real revenue closed.", href: "/pipeline", status: ["live", "Active"] },
      { icon: "flag", t: "Proof Sprint", p: "A guided 30-day test that proves whether Genie makes you money: commit to one customer type + one offer, and it tracks the 7 numbers that matter (contacts, replies, meetings, revenue, revenue-per-100) and gives a plain verdict — scale, tweak, or fix the offer.", href: "/sprint", status: ["live", "Active"] },
    ],
  },
  {
    label: "FINDS CLIENTS & EARNS COVERAGE",
    sub: "Outbound + earned media — find the right person, pitch them, get others to feature you.",
    items: [
      { icon: "target", t: "Find clients", p: "Name a niche; Genie finds real companies, the decision-maker at each, a verified contact, and a pitch written for them.", href: "/prospects", status: ["live", "Active"] },
      { icon: "megaphone", t: "Get featured (earned media)", p: "Finds roundups, guest-post sites, press and directories that could feature you + drafts the outreach; results persist per category.", href: "/featured", status: ["live", "Active"] },
      { icon: "conversations", t: "Partnership co-seller", p: "Finds complementary, non-competing businesses and drafts a win-win partnership pitch — warm referrals close ~10× cold.", href: "/featured", status: ["live", "Active"] },
      { icon: "mail", t: "Sends outreach + Inbox", p: "Compliant, capped email sent from your own Gmail; every reply threads back into an Inbox with a notification.", href: "/inbox", status: ["info", "Connect Gmail"] },
      { icon: "check", t: "Deliverability preflight", p: "Before outreach goes out, Genie checks your sending domain's SPF, DKIM and DMARC, scores your inbox-readiness, gives you the exact records to fix, and sets safe volume — so your email lands instead of dying in spam.", href: "/connections", status: ["live", "Active"] },
      { icon: "link", t: "Foundation links", p: "A tracked checklist of high-authority free profiles with Genie-written bios — a consistent brand entity across the web that Google and AI use to recognize you. Most of these links are nofollow, so treat them as brand + discovery, not a ranking hack. Includes a Chrome Web Store listing (Genie hands you a simple, legit extension + the steps).", href: "/foundation", status: ["draft", "You create"] },
    ],
  },
  {
    label: "CAPTURES & MEASURES",
    sub: "Turns readers into leads, and proves the work in real numbers.",
    items: [
      { icon: "bolt", t: "Smart conversion CTA", p: "Every article ends with a specific, buyer-stage-matched call-to-action Genie writes for that page (a comparison gets ‘Get a quote’, a buy page gets ‘Shop now’) — turning readers into clicks to your money page, all UTM-tagged so sales trace back.", href: "/approvals", status: ["live", "Automatic"] },
      { icon: "mail", t: "Email capture & lead magnet", p: "Published pages carry an opt-in so readers become leads you can follow up — not just anonymous traffic.", href: "/growth", status: ["live", "Active"] },
      { icon: "growth", t: "Per-page results", p: "See exactly what each published page earns — real clicks to your site (via the CTA) and leads captured — first-party, from day one, no analytics connection needed.", href: "/growth", status: ["live", "Active"] },
      { icon: "bolt", t: "Revenue attribution", p: "A guided 3-step setup connects your payment provider (Stripe, Shopify, and more). Send a test event and Genie confirms it received it — then traces every sale back to the exact page that drove it.", href: "/impact", status: ["info", "Connect revenue"] },
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

const TONE = { live: "live", info: "info", pending: "neutral", draft: "neutral" };

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
        <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(29px,3.2vw,40px)" }}>Everything Genie can do <span className="dawn-text">for you.</span></h1>
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
