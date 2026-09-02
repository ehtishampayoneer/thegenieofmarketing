"use client";

// ── HOW IT WORKS (in-app) ──
// The whole product explained end to end, in plain words: what Genie is, the
// first ten minutes, what it does overnight, your daily ten minutes, every room
// in the app, what each connection unlocks, the rules it will not break, how it
// earns autonomy, its honest limits, and what to do when.
//
// This is the WHOLE-PRODUCT guide. It complements two things and duplicates
// neither: /capabilities is the flat reference list of features + status, and
// PageGuide (the info button, lib/page-guides.js) explains ONE screen at a time.
// This is the narrative that ties them together. Nothing here restarts setup.
//
// Deliberately static: no fetches, no state. It must render instantly and be
// correct even on a brand-new account with no data.

import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";

// ── 01 · the five jobs ────────────────────────────────────────────────────────
const JOBS = [
  { icon: "crosshair", t: "Finds people asking to buy right now", p: "Across Reddit, Quora, Hacker News, GitHub and software recommendation sites, then drafts your reply." },
  { icon: "write", t: "Writes your content", p: "Aimed at the exact phrases your buyers type into Google, using your own facts where you have given them." },
  { icon: "search", t: "Checks what AI tells your buyers", p: "When someone asks ChatGPT or Perplexity what to buy, Genie checks whether you get named or a rival does, then writes the page that gives you a better shot." },
  { icon: "mail", t: "Runs your outreach", p: "Finds real companies, the right person at each, and a pitch written for that business. Capped, compliant, sent from your own address." },
  { icon: "bolt", t: "Measures everything", p: "Rankings, clicks, replies, and where a payment provider is connected, real revenue traced back to the page that earned it." },
];

// ── 02 · first run (a real sequence, so it is numbered) ───────────────────────
const FIRST_RUN = [
  { t: "You paste your website address", p: "One box, one button. With or without https. If Genie cannot read the site it says so plainly and lets you try another address.", where: "The welcome screen, right after your first sign-in" },
  { t: "Genie reads your site while you read the pitch", p: "The scan starts the moment you press go. It reads your pages, checks how they are built, measures speed, and works out in plain language what you sell, who buys it, what makes you different, and who your real competitors are.", where: "Runs: the site scan and your business profile" },
  { t: "You watch it work, live", p: "Six lines play out as the real results land. Not an animation: each line fills in with what Genie actually found. It names what you sell, names your competitors, tells you how many people are asking for your product right now, and tells you whether AI assistants name you or someone else.", where: "Two engines fire for real here: the buyer hunt and the AI search check" },
  { t: "The findings", p: "Your day-one proof, and often the uncomfortable part. It will typically say something like: AI names your competitor, not you, in all 6 buyer answers, and, I found 4 people asking for this right now and I have drafted your replies. Both are real numbers pulled minutes earlier.", where: "The reveal screen" },
  { t: "You correct Genie's understanding", p: "The most important step, and the easiest to rush. Genie shows how it read your business and asks a few sharp questions. Talk back in normal sentences. If it thinks you sell software and you sell furniture, say so. If it targeted the clever technology you use instead of the thing people actually search for, fix it here. Nothing is built until you confirm, and the moment you do, Genie wipes its earlier guess and rebuilds your keyword strategy on the corrected understanding.", where: "Every article, keyword and email afterwards is built on this answer" },
  { t: "You connect your accounts", p: "Each connection turns an estimate into a measured number, or turns a draft into something that publishes for real. You can skip them all and come back later.", where: "Optional, but Google is the single biggest unlock" },
  { t: "You add your details", p: "Business name, logo, and the email address replies should reach. These get baked into every article and every outreach email sent on your behalf, so it is worth two minutes.", where: "Editable any time in Settings" },
  { t: "You land on Today", p: "Setup is over and Genie is already working. From here your job is a short daily review, and nothing else.", where: "Today is your home screen from now on" },
];

// ── 03 · the night shift (order matters, so it is numbered) ───────────────────
const NIGHT = [
  { t: "It pulls your real numbers first", p: "Before deciding anything, Genie pulls fresh data from Search Console and Analytics if connected. Real positions, real clicks, real impressions. It saves a daily snapshot, which is what makes your ranking chart a genuine history rather than a guess." },
  { t: "It re-grades every keyword and retires the losers", p: "Each target is scored again on real performance. Keywords that have had genuine effort and still go nowhere are retired, so Genie stops spending your nights on them. Most tools never do this." },
  { t: "It hunts buyers across five surfaces", p: "Reddit, Quora, the open web, Hacker News, GitHub and software recommendation threads. It looks for live conversations where someone is asking for what you sell, scores how close each is to buying from 0 to 100, and writes a value-first reply in your voice." },
  { t: "It checks what AI says about you", p: "It asks the assistants your buyers' real questions and records who gets named. Every gap becomes a plan: an answer page written to be the most quotable source on that question." },
  { t: "It writes your content", p: "Publish-ready articles land in Approvals. Each is pushed to add something genuinely new rather than rehashing what already ranks, and weaves in your own data, process and expert take if you have added them in Settings." },
  { t: "It unsticks what is stuck", p: "Where a keyword has had real effort and still will not move, Genie writes one supporting piece that deepens the topic and links to the stuck page. Authority, not more volume. One per night, deliberately." },
  { t: "It builds topic hubs", p: "Once several related articles exist, Genie assembles one hub page linking them all together, and links each back. Search engines read that shape as expertise on a subject. One hub per night at most." },
  { t: "It checks how earlier work performed", p: "It reads engagement on everything it posted, sorts it into winning, flat or dud, and feeds that back into what it chooses to do next." },
  { t: "It scans for replies and drafts answers", p: "New replies on your posts become notifications with a suggested answer already written. With Gmail connected, outreach replies are pulled in and threaded in your Inbox." },
  { t: "It sends the day's outreach", p: "A capped, spaced batch. Never a blast." },
  { t: "It refreshes pages going stale", p: "A page you already won with, untouched for 30 days, gets an improved version staged for approval at the same address. Rankings you earned do not quietly slip away." },
  { t: "It writes down what it learned", p: "Every decision, the reason for it, and how confident it was. You can read all of it in What Genie Learned. Nothing about its reasoning is hidden from you." },
];

// ── 04 · the three decisions ──────────────────────────────────────────────────
const DECISIONS = [
  { k: "A", t: "Approve", tone: "live", p: "An article goes live on your own blog or your hosted Genie page immediately. A community post is marked posted and its channel goes on cooldown so you never look spammy." },
  { k: "E", t: "Edit", tone: "info", p: "Change the wording, swap the image, adjust the framing. Your edit is saved and used, and Genie learns from what you changed." },
  { k: "S", t: "Skip", tone: "neutral", p: "Not now. It leaves the queue, and Genie gets sharper about what you actually want." },
  { k: "← →", t: "Move", tone: "neutral", p: "Arrow keys move through the queue without the mouse. The whole review is built to be done from the keyboard in a couple of minutes." },
];

const ON_APPROVE = [
  "It publishes to your blog if WordPress is connected, otherwise to your own hosted Genie page at a public, indexable address.",
  "A clean plain-text twin of the page is created, which AI engines read far more reliably than a normal web page.",
  "Bing and Yandex are pinged instantly, which matters because ChatGPT Search and Perplexity read those indexes. Google is asked to crawl it.",
  "Two or three of your older, already-indexed pages automatically add a link to it, so it gets found in days instead of weeks.",
  "A call to action written for that specific page is attached, tagged so any resulting sale can be traced back.",
];

// ── 05 · every room ───────────────────────────────────────────────────────────
const ROOMS = [
  {
    label: "YOUR EMPLOYEE — THE DAILY WORK",
    sub: "What Genie is doing for you, and the two screens you actually open each day.",
    items: [
      { icon: "home", t: "Today", href: "/today", tag: ["live", "Daily"], p: "Home. What Genie did overnight, the next three best moves, this week's growth, and what is waiting on you.", when: "Open every morning" },
      { icon: "tasks", t: "Approvals", href: "/approvals", tag: ["live", "Daily"], p: "The review station. Everything Genie made, one at a time, with a real preview of exactly what goes out. Approve, edit or skip.", when: "The one screen you must not skip" },
      { icon: "crosshair", t: "Buyer Hunt", href: "/hunt", tag: ["live", "Money now"], p: "A live board of the hottest buyers found across Hacker News, software recommendation sites, GitHub, Reddit and Quora, ranked 0 to 100 by how close they are to buying. One tap copies Genie's reply and opens the thread. Name your rivals here to catch their unhappy users.", when: "Check when you want customers this week, not this quarter" },
      { icon: "coins", t: "Revenue Recovery", href: "/recover", tag: ["live", "Fast money"], p: "Upload your old leads and past customers. Genie reads each one and writes a specific win-back message, you review and send from your own Gmail. Warm contacts convert in days, which makes this the fastest money in the product.", when: "Do this in week one if you have any old list at all" },
      { icon: "conversations", t: "Conversations", href: "/conversations", tag: ["live", "Active"], p: "Every conversation Genie is running for you, told as a story: found, wrote, posted, got traction, replies came in, still watching.", when: "Open when you want to feel the work happening" },
      { icon: "target", t: "Find clients", href: "/prospects", tag: ["live", "Active"], p: "Name a niche. Genie finds real companies in it, the decision-maker at each, their best contact address, and a pitch written for that specific business. You review, tweak and send.", when: "For deliberate outbound, not spray and pray" },
      { icon: "megaphone", t: "Get featured", href: "/featured", tag: ["live", "Active"], p: "Four plays: roundups, guest posts, press and directories. Genie finds sites that could feature you and drafts the outreach. Sites you already applied to are held back for 60 days so you never pitch twice. Also holds the partnership finder.", when: "Earned media, plus warm referral partners" },
      { icon: "inbox", t: "Inbox", href: "/inbox", tag: ["info", "Needs Gmail"], p: "Everyone Genie emailed on your behalf, threaded with their reply. Sent items appear the moment you press send. Replies are pulled from your own Gmail and land here with a notification.", when: "Check after any outreach batch" },
      { icon: "board", t: "Deal Pipeline", href: "/pipeline", tag: ["live", "Active"], p: "One board across every channel: reached, opened, replied with each reply already classified, and won with the real revenue attached. Where hunting turns into money you can see.", when: "Your weekly scorecard" },
      { icon: "flag", t: "Proof Sprint", href: "/sprint", tag: ["live", "Recommended"], p: "A guided 30-day test that answers the only question that matters: does this make money? Commit to one customer type and one offer, then watch seven numbers including contacts, replies, meetings booked, closed revenue and revenue per 100 contacts. At day 30 it gives a plain verdict: scale it, change one thing, or fix the offer.", when: "Start this on day one if you want a real answer" },
    ],
  },
  {
    label: "GROWTH JOURNEY — WHERE YOU ARE GETTING STRONGER",
    sub: "The proof surfaces. Open these weekly, not daily.",
    items: [
      { icon: "growth", t: "Growth Score", href: "/growth", tag: ["live", "Active"], p: "One honest score for your organic growth, a ranking chart drawn with the best position at the top so improvement reads as a rising line, your keyword table, and the strategy phase Genie is currently in.", when: "The place to answer: is this working?" },
      { icon: "search", t: "AI Search Presence", href: "/ai-search", tag: ["live", "The wedge"], p: "When your buyers ask ChatGPT, Perplexity, Gemini or Claude for a recommendation, are you named? Here is what is happening, who gets named instead of you, the plan, and the one question to start with. Every gap can be approved into an answer page.", when: "The thing Genie does that most tools do not" },
      { icon: "bolt", t: "Customer Impact", href: "/impact", tag: ["info", "Connect revenue"], p: "Real revenue traced back to the exact page that drove it. Honest about where the number came from: verified from a connected payment provider, or an empty state telling you to connect one. It will not invent a figure.", when: "Needs a payment provider connected" },
      { icon: "brain", t: "What Genie Learned", href: "/learning", tag: ["live", "Active"], p: "What it learned from real results, what it changed because of that, and a full decision ledger. Competitors are black boxes. Genie shows its working.", when: "Read when you want to trust it more" },
      { icon: "link", t: "Foundation links", href: "/foundation", tag: ["draft", "You create"], p: "A tracked checklist of high-authority free sites where your brand should have a profile, with the bios already written. You create the accounts and mark them done. Most are nofollow, so treat these as brand recognition and discovery rather than a ranking trick.", when: "A one-time weekend job with lasting value" },
      { icon: "globe", t: "Website Setup", href: "/site", tag: ["live", "Active"], p: "A read-only scan of your own site that hands back an exact, prioritised fix list: titles, descriptions, structured data, canonical tags, sitemap and FAQ markup. Every fix is a snippet you or your developer paste in. Genie never edits your site.", when: "Do this once, early. It makes everything else rank faster" },
      { icon: "megaphone", t: "Market Testing", href: "/markets", tag: ["live", "Testing"], p: "Ranks countries you can genuinely serve where demand is real and competition is thin, using your own Search Console country data where it exists. Pick one and Genie drafts a localized page to test it, then tracks the search results. A test, not a promise.", when: "For when your home market is working" },
    ],
  },
  {
    label: "SETTINGS — STAYING IN CONTROL",
    sub: "Where you tune it, and where the brakes are.",
    items: [
      { icon: "link", t: "Connections", href: "/connections", tag: ["live", "Setup"], p: "The one setup surface. What is connected, what is not, and the action for each. It also explains in plain language why a Google connection failed, instead of just showing not connected.", when: "Visit whenever a page says it needs data" },
      { icon: "check", t: "Trust Center", href: "/trust", tag: ["live", "Control"], p: "You are always in control. Genie earns freedom channel by channel as it proves itself, and you can grant or take back that freedom at any moment.", when: "Read once so you know where the brakes are" },
      { icon: "settings", t: "Settings", href: "/settings", tag: ["live", "Active"], p: "Your business details and sender email. Also where you add your own facts, data, process and expert opinions, which is the single biggest quality upgrade you can give the writing.", when: "Ten minutes here pays off in every article" },
      { icon: "spark", t: "What Genie can do", href: "/capabilities", tag: ["live", "Reference"], p: "The full capability list, grouped by job, each with an honest status: active now, needs a one-time connection, or waiting on an external approval. Nothing overstated.", when: "Your reference when you wonder: can it do X?" },
    ],
  },
];

// ── 06 · connections ──────────────────────────────────────────────────────────
const CONNECTIONS = [
  { name: "Google", sub: "Search Console and Analytics", unlocks: "Real rankings, real clicks, real impressions, replacing estimates. Your ranking history chart becomes genuine, keyword retirement gets accurate, and country data for market testing becomes verified rather than projected.", tag: ["live", "Do first"] },
  { name: "Your blog", sub: "WordPress", unlocks: "Approved articles publish straight to your own site instead of a hosted Genie page, so your domain gets the authority rather than ours.", tag: ["live", "Do first"] },
  { name: "Gmail", sub: "", unlocks: "Outreach sends from your own address, which lands in inboxes far more reliably. Replies are pulled back into your Genie Inbox automatically.", tag: ["info", "Before outreach"] },
  { name: "Payment provider", sub: "Stripe, Shopify and others", unlocks: "Real revenue attribution. A guided three-step setup, then you send a test event and Genie confirms it arrived. After that, every sale traces back to the exact page that drove it.", tag: ["info", "For proof"] },
  { name: "X", sub: "", unlocks: "Links your account so posts are prepared for it. Posting is still your tap, deliberately.", tag: ["draft", "Optional"] },
];

// ── 07 · the rules ────────────────────────────────────────────────────────────
const RULES = [
  { icon: "check", t: "It never silently posts as you", p: "Anywhere automation gets accounts banned, which is Reddit, Quora, X, LinkedIn, Medium and forums, Genie writes the post and opens the page filled in. You press post. Your accounts stay safe." },
  { icon: "globe", t: "It never edits your own website", p: "Automatic improvements only ever touch pages Genie fully owns and hosts. For your real site it recommends and hands you copy-paste snippets. Your site cannot be broken by something you did not do yourself." },
  { icon: "eye", t: "Estimates are labelled as estimates", p: "Search volumes and difficulty scores are marked as smart estimates until real Google data is connected, then real data replaces them. Genie never dresses a guess up as a Google number." },
  { icon: "x", t: "No bought engagement, ever", p: "No purchased likes, followers or clicks. They get products blacklisted, and worse for you, they poison the learning loop so Genie starts believing fake signals." },
  { icon: "growth", t: "Progress bars only move on real results", p: "Nothing advances because a task was completed. Bars move when actual clicks and impressions move. If nothing happened, the screen says so." },
  { icon: "mail", t: "Email is capped and compliant", p: "15 a day on Free, 50 a day on Pro, sent as a slow drip and never as a blast. Every message carries a one-click unsubscribe and your physical address. Anyone who opts out is added to a suppression list and checked before every future send." },
  { icon: "clock", t: "Community posts get cooldowns", p: "Every channel has a limit and a waiting period after each post. Genie will not let you flood a subreddit even if you want to." },
  { icon: "write", t: "Quality over volume in new markets", p: "When a country needs content in a language Genie cannot write well, it blocks the draft rather than shipping a thin machine translation. Mass auto-translated pages are exactly how sites get penalised." },
];

// ── 08 · the trust ramp ───────────────────────────────────────────────────────
const TRUST = [
  { level: "Review", tone: "neutral", means: "Everything waits for your approval. The starting point for every channel.", how: "Default" },
  { level: "Assisted", tone: "info", means: "Genie drafts and you approve with one tap.", how: "After 3 approvals on that channel" },
  { level: "Auto", tone: "live", means: "Genie acts on that channel without waiting for you.", how: "After 6 approvals and 1 proven win" },
];

// ── 09 · honest limits ────────────────────────────────────────────────────────
const LIMITS = [
  ["It is a climb, not a switch.", "Search and AI visibility pay off over weeks and months. Buyer Hunt and Revenue Recovery are the fast lanes, which is exactly why they exist. Use them while the slow engine builds."],
  ["Nobody can force an AI to name you.", "Genie can make you the most citable answer on your topic, and it measures whether that is working. It cannot guarantee a citation, and it will not claim to."],
  ["It amplifies a real product.", "It cannot rescue an offer nobody wants. The 30-day Proof Sprint is built to tell you that honestly rather than let you spend six months finding out."],
  ["It needs about 10 minutes of you per day.", "Approving drafts and posting community replies. A deliberate design choice, not a missing feature."],
  ["Real search volumes are pending.", "Volumes are smart estimates until the Google Ads API token is approved. Your own site's real data from Search Console is available today."],
  ["Revenue attribution needs a connection.", "Until you connect a payment provider, Genie shows clicks and captured leads, which are first-party and real, but not closed revenue."],
  ["Country-level revenue tracking is not built yet.", "Market Testing tracks search visibility per country. Tracing leads and revenue back to a specific country is the next phase, and the page says so rather than implying otherwise."],
  ["Paid advertising is not built.", "Genie drafts ad ideas but does not run Meta or Google Ads campaigns."],
];

// ── 10 · what to do when ──────────────────────────────────────────────────────
const RECIPES = [
  { q: "I need customers this month", a: "Revenue Recovery first, since warm contacts convert in days. Then Buyer Hunt daily, because those people are already asking to buy. Start a Proof Sprint so you get a real verdict at day 30 instead of a feeling.", href: "/recover" },
  { q: "Genie misunderstood my business", a: "Fix it in Settings, then rebuild your keyword strategy from the Growth page. Everything downstream is rebuilt on the corrected understanding. Do this immediately rather than working around it.", href: "/settings" },
  { q: "The keywords feel wrong", a: "Usually this means Genie targeted your clever technology instead of what buyers actually type. Buyers search for the product, not the method. Correct the understanding, then rebuild.", href: "/growth" },
  { q: "The articles feel generic", a: "Add your own facts in Settings: your data, your process, your proof, your opinion. This is the single biggest quality lever in the product, and the difference between a page that ranks and one that reads like everything else.", href: "/settings" },
  { q: "Nothing is ranking yet", a: "Check Growth Score for whether positions are moving at all, even below page one. Movement from position 80 to position 30 is real progress that no traffic number will show you. If a keyword is genuinely stuck, Genie is already escalating it nightly.", href: "/growth" },
  { q: "I do not have time today", a: "Open Approvals and clear only the owned-content items at the top. Those are the ones that publish for real. Community posts can wait a day without any cost.", href: "/approvals" },
  { q: "How do I know it is actually working?", a: "Deal Pipeline for money, Growth Score for rankings, AI Search Presence for citations, Customer Impact for revenue per page. If you want one number, run a Proof Sprint and read the verdict at day 30.", href: "/pipeline" },
  { q: "My emails are going to spam", a: "Connect Gmail so you send from your own address, and run the deliverability check on the Connections page. It gives you the exact DNS records to add.", href: "/connections" },
];

const TONE = { live: "live", info: "info", draft: "neutral", neutral: "neutral" };

// ── small building blocks ─────────────────────────────────────────────────────

function Act({ n, label, title, sub, children }) {
  return (
    <section className="mg-act">
      <p className="mg-klabel">{n} &nbsp;{label}</p>
      <h2 className="mt-2 mg-display" style={{ fontSize: "clamp(23px,2.4vw,30px)" }}>{title}</h2>
      {sub && <p className="mt-2 mg-lede">{sub}</p>}
      {children}
    </section>
  );
}

// A numbered sequence. Used ONLY where the order genuinely carries meaning
// (first run, the night shift) — never as decoration on an unordered list.
function Sequence({ items }) {
  return (
    <ol className="mt-4" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((s, i) => (
        <li
          key={i}
          className="grid gap-4"
          style={{
            gridTemplateColumns: "34px minmax(0,1fr)",
            padding: "16px 0",
            borderTop: "1px solid var(--hair)",
            borderBottom: i === items.length - 1 ? "1px solid var(--hair)" : "none",
          }}
        >
          <span className="mg-num text-[12px] font-bold" style={{ color: "var(--accent-ink)", paddingTop: 3 }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="text-[15.5px] font-bold" style={{ color: "var(--fg)", lineHeight: 1.35 }}>{s.t}</p>
            <p className="mt-1.5 text-[14px] mg-muted leading-relaxed" style={{ maxWidth: "64ch" }}>{s.p}</p>
            {s.where && <p className="mt-2 text-[12px] mg-subtle">{s.where}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function RoomCard({ it }) {
  const Ic = Icon[it.icon] || Icon.spark;
  return (
    <a href={it.href} className="mg-lift mg-focus" style={{ textDecoration: "none" }}>
      <Card className="p-4 h-full">
        <div className="flex items-start gap-3">
          <span className="mg-tile shrink-0" style={{ width: 36, height: 36, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Ic size={18} /></span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{it.t}</span>
              <span className="ml-auto"><Pill tone={TONE[it.tag[0]]}>{it.tag[1]}</Pill></span>
            </div>
            <p className="mt-1 text-[12.5px] mg-muted leading-snug">{it.p}</p>
            <p className="mt-2 text-[11.5px] mg-subtle">{it.when}</p>
          </div>
        </div>
      </Card>
    </a>
  );
}

// ── the page ──────────────────────────────────────────────────────────────────

export default function HowItWorksPage() {
  return (
    <OperatorShell active="howitworks">
      <div className="max-w-[1000px]">

        {/* ── MASTHEAD ── */}
        <p className="mg-eyebrow"><Icon.info size={14} /> Your employee</p>
        <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(29px,3.2vw,40px)" }}>
          How Genie works, <span className="dawn-text">start to finish.</span>
        </h1>
        <p className="mt-2 text-[14.5px] mg-muted" style={{ maxWidth: "62ch" }}>
          You give Genie your website. It learns your business, finds people who want to buy, writes the content, publishes what it is allowed to publish, and asks you before it does anything in your name. This is the whole thing, in plain words.
        </p>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Pill tone="live">10 minutes to set up</Pill>
          <Pill>About 10 minutes a day after that</Pill>
          <Pill>Works overnight while you sleep</Pill>
        </div>

        {/* ── 01 · THE IDEA ── */}
        <Act
          n="01"
          label="THE IDEA"
          title="Not a dashboard. An employee."
          sub="Most marketing tools hand you charts and let you do the work. Genie does the work and hands you decisions."
        >
          <p className="mt-3 text-[14px] mg-muted" style={{ maxWidth: "64ch" }}>
            Think of it as hiring someone on day one. It reads your website to understand what you sell and who buys it, then does five jobs at once, every night:
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {JOBS.map((j, i) => {
              const Ic = Icon[j.icon] || Icon.spark;
              return (
                <Card key={i} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="mg-tile shrink-0" style={{ width: 34, height: 34, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Ic size={17} /></span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{j.t}</p>
                      <p className="mt-1 text-[12.5px] mg-muted leading-snug">{j.p}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="mt-3 p-4" style={{ borderLeft: "3px solid var(--signal-live)" }}>
            <p className="text-[13.5px] font-bold" style={{ color: "var(--fg)" }}>The one promise</p>
            <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "64ch" }}>
              Genie is built around a single measure: getting you a real customer you can trace, within 30 days. Not traffic, not published posts, not keywords tracked. A customer.
            </p>
          </Card>
        </Act>

        {/* ── 02 · FIRST RUN ── */}
        <Act
          n="02"
          label="YOUR FIRST 10 MINUTES"
          title="From a website address to an employee at work."
          sub="This part is a real sequence. Each step unlocks the next, so it is worth knowing what each one is doing."
        >
          <Sequence items={FIRST_RUN} />
        </Act>

        {/* ── 03 · THE NIGHT SHIFT ── */}
        <Act
          n="03"
          label="WHAT HAPPENS OVERNIGHT"
          title="The night shift, step by step."
          sub="Once a night, automatically, Genie runs the same full pass for your business. Here is the actual order, because the order is the reason it works."
        >
          <Sequence items={NIGHT} />
          <Card className="mt-3 p-4">
            <p className="text-[13.5px] font-bold" style={{ color: "var(--fg)" }}>Each business gets its own run</p>
            <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "64ch" }}>
              Runs are separated per business and can be safely retried, so one slow or failing business never blocks anyone else's night. If a run fails it is retried on the next pass rather than silently skipped.
            </p>
          </Card>
        </Act>

        {/* ── 04 · THE DAILY ROUTINE ── */}
        <Act
          n="04"
          label="YOUR DAILY 10 MINUTES"
          title="Open two screens. That is the routine."
        >
          <p className="mt-3 text-[14px] mg-muted" style={{ maxWidth: "64ch" }}>
            <b style={{ color: "var(--fg)" }}>First, Today.</b> Your home screen opens with what Genie did overnight, the three things worth doing next, this week's growth, and what is waiting on you. You are not meant to study it. Read the top, then move on.
          </p>
          <p className="mt-2 text-[14px] mg-muted" style={{ maxWidth: "64ch" }}>
            <b style={{ color: "var(--fg)" }}>Then, Approvals.</b> The only screen you truly have to visit. One item fills the screen at a time: what it is, why Genie chose it, what it targets, and a real formatted preview of exactly what will go out. Your own channels come first, because those are the ones Genie can actually publish for you.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DECISIONS.map((d, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{d.t}</span>
                  <span className="ml-auto"><Pill tone={d.tone}>{d.k}</Pill></span>
                </div>
                <p className="mt-1 text-[12.5px] mg-muted leading-snug">{d.p}</p>
              </Card>
            ))}
          </div>

          <p className="mt-5 text-[14px] font-bold" style={{ color: "var(--fg)" }}>What happens the second you approve an article</p>
          <ul className="mt-2 flex flex-col gap-2" style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: "66ch" }}>
            {ON_APPROVE.map((line, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mg-tile shrink-0" style={{ width: 18, height: 18, marginTop: 2, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><Icon.check size={11} /></span>
                <span className="text-[13.5px] mg-muted leading-snug">{line}</span>
              </li>
            ))}
          </ul>

          <Card className="mt-4 p-4" style={{ borderLeft: "3px solid var(--signal-warn)" }}>
            <p className="text-[13.5px] font-bold" style={{ color: "var(--fg)" }}>Genie will never post to your social accounts by itself</p>
            <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "64ch" }}>
              Reddit, Quora, X, LinkedIn, Medium and forums are draft-and-you-post. Genie writes it and opens the page with everything filled in. You press post. This is deliberate: silent automated posting is exactly what gets accounts banned, and a banned account costs more than a saved click.
            </p>
          </Card>
        </Act>

        {/* ── 05 · EVERY ROOM ── */}
        <Act
          n="05"
          label="EVERY ROOM, EXPLAINED"
          title="What each screen is for, and when to open it."
          sub="The menu is grouped the way you actually work: what your employee is doing, where you are growing, and how you stay in control."
        >
          <div className="mt-4 flex flex-col gap-7">
            {ROOMS.map((g, gi) => (
              <div key={gi}>
                <p className="mg-klabel">{g.label}</p>
                <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "64ch" }}>{g.sub}</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {g.items.map((it, i) => <RoomCard key={i} it={it} />)}
                </div>
              </div>
            ))}
          </div>

          <Card className="mt-4 p-4">
            <p className="text-[13.5px] font-bold" style={{ color: "var(--fg)" }}>Ask Genie anything, from anywhere</p>
            <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "64ch" }}>
              Press Ctrl+K or Cmd+K on any screen to open the chat. Ask things like what should I publish this week, or which buyers are asking for me right now. A live activity ticker runs across the top of every page, and the How this works button in the header explains whichever screen you are on.
            </p>
          </Card>
        </Act>

        {/* ── 06 · CONNECTIONS ── */}
        <Act
          n="06"
          label="CONNECTIONS"
          title="Each one turns a guess into a fact."
          sub="Genie works without any of these. Every connection you add replaces an estimate with a measured number, or turns a draft into something that publishes for real."
        >
          <div className="mt-4 flex flex-col gap-3">
            {CONNECTIONS.map((c, i) => (
              <Card key={i} className="p-4">
                <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{c.name}</span>
                    {c.sub && <span className="text-[12px] mg-subtle">{c.sub}</span>}
                    <span className="ml-auto"><Pill tone={TONE[c.tag[0]]}>{c.tag[1]}</Pill></span>
                  </div>
                  <p className="text-[13px] mg-muted leading-snug" style={{ maxWidth: "70ch" }}>{c.unlocks}</p>
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-3 p-4" style={{ borderLeft: "3px solid var(--accent)" }}>
            <p className="text-[13.5px] font-bold" style={{ color: "var(--fg)" }}>Before your first outreach email</p>
            <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "64ch" }}>
              Genie checks your sending domain's SPF, DKIM and DMARC records, scores how ready your domain is to reach inboxes, hands you the exact records to fix, and sets a safe sending volume. That is the difference between landing in an inbox and dying in spam, and it runs before anything goes out.
            </p>
            <div className="mt-3">
              <a href="/connections" className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}>Open Connections</a>
            </div>
          </Card>
        </Act>

        {/* ── 07 · THE RULES ── */}
        <Act
          n="07"
          label="THE RULES GENIE FOLLOWS"
          title="The things it will not do, on purpose."
          sub="These are enforced in the code, not just promised in marketing. Most exist because the shortcut would eventually cost you more than it earns."
        >
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RULES.map((r, i) => {
              const Ic = Icon[r.icon] || Icon.check;
              return (
                <Card key={i} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="mg-tile shrink-0" style={{ width: 34, height: 34, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><Ic size={17} /></span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{r.t}</p>
                      <p className="mt-1 text-[12.5px] mg-muted leading-snug">{r.p}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </Act>

        {/* ── 08 · THE TRUST RAMP ── */}
        <Act
          n="08"
          label="HOW GENIE EARNS FREEDOM"
          title="It starts on a short leash. You decide when to lengthen it."
          sub="Every channel has its own trust level, and every one starts at the safest setting. Genie moves up only by proving itself on real work, and you can move it back down at any time."
        >
          <div className="mt-4 flex flex-col gap-3">
            {TRUST.map((t, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start gap-3 flex-wrap">
                  <span style={{ minWidth: 84 }}><Pill tone={t.tone}>{t.level}</Pill></span>
                  <p className="text-[13.5px] mg-muted flex-1 min-w-[220px] leading-snug">{t.means}</p>
                  <p className="text-[12.5px] mg-subtle mg-num">{t.how}</p>
                </div>
              </Card>
            ))}
          </div>

          <p className="mt-4 text-[14px] mg-muted" style={{ maxWidth: "64ch" }}>
            Even at Auto there are two more gates. The content has to pass a safety and brand check, and Genie's own confidence in it has to be at least 80 out of 100. If either fails, it falls back to asking you. The system is built to fail towards asking permission, never towards acting alone.
          </p>
          <p className="mt-2 text-[14px] mg-muted" style={{ maxWidth: "64ch" }}>
            Every one of those decisions is written down with the reason: what it chose, why, how confident it was, and whether it acted or held back. You can read the whole ledger in <a href="/learning" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>What Genie Learned</a>.
          </p>

          <Card className="mt-3 p-4" style={{ borderLeft: "3px solid var(--signal-live)" }}>
            <p className="text-[13.5px] font-bold" style={{ color: "var(--fg)" }}>You can always pull the brake</p>
            <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "64ch" }}>
              There is a kill switch, per-channel permission levels, and a spending cap. Revoking trust takes one click and takes effect immediately.
            </p>
            <div className="mt-3">
              <a href="/trust" className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}>Open Trust Center</a>
            </div>
          </Card>
        </Act>

        {/* ── 09 · HONEST LIMITS ── */}
        <Act
          n="09"
          label="HONEST LIMITS"
          title="What Genie cannot do yet."
          sub="Knowing these upfront prevents the disappointment that makes people quit in week three."
        >
          <ul className="mt-4 flex flex-col gap-3" style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: "70ch" }}>
            {LIMITS.map(([t, p], i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mg-tile shrink-0" style={{ width: 18, height: 18, marginTop: 3, background: "var(--surface-2)", color: "var(--fg-subtle)" }}><Icon.info size={11} /></span>
                <span className="text-[13.5px] mg-muted leading-snug">
                  <b style={{ color: "var(--fg)", fontWeight: 600 }}>{t}</b> {p}
                </span>
              </li>
            ))}
          </ul>
        </Act>

        {/* ── 10 · WHAT TO DO WHEN ── */}
        <Act
          n="10"
          label="WHAT TO DO WHEN"
          title="Straight answers to the questions people actually ask."
        >
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RECIPES.map((r, i) => (
              <a key={i} href={r.href} className="mg-lift mg-focus" style={{ textDecoration: "none" }}>
                <Card className="p-4 h-full">
                  <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{r.q}</p>
                  <p className="mt-1 text-[12.5px] mg-muted leading-snug">{r.a}</p>
                </Card>
              </a>
            ))}
          </div>
        </Act>

        {/* ── CLOSING ── */}
        <div className="mt-9 mb-2">
          <Card className="p-5 mg-ambient">
            <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>The shortest possible version</p>
            <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "66ch" }}>
              Paste your website. Spend five minutes correcting how Genie understood your business, because everything is built on that. Connect Google and your blog. Then open Approvals once a day and press approve, edit or skip. Genie does the rest overnight, writes down every decision it made, and asks before doing anything in your name.
            </p>
            <div className="mt-3 flex items-center gap-2.5 flex-wrap">
              <a href="/capabilities" className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}>See every capability</a>
              <a href="/approvals" className="mg-btn mg-btn--dawn" style={{ fontSize: 13 }}>Review &amp; publish →</a>
            </div>
          </Card>
        </div>

      </div>
    </OperatorShell>
  );
}
