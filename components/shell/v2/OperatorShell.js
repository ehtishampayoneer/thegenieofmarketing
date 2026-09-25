"use client";

// ── OPERATOR SHELL (V2) ──
// The operating system of an AI marketing employee. Two zones now:
//   • Command rail (left)  — where you go
//   • Work-stream (center) — a live-news ticker, then what Genie accomplished
// The old right-side Live Activity rail is gone; its stream now lives in the
// horizontal ticker directly under the top bar, so the "always working" feel
// runs across the top of every page instead of hugging one edge.
// Day is the default (premium, calm reveal). Night is Mission Control.
// Live-with-fallback: pulls the real activity feed + entity + counts when signed
// in. No representative data: an empty ticker says nothing has run yet.

import { useState, useEffect } from "react";
import Icon from "@/components/ui/Icon";
import { GenieMark } from "@/components/brand/GenieMark";
import { GenieWordmark } from "@/components/brand/GenieWordmark";
import { Kbd } from "@/components/ui/v2/primitives";
import { fetchLive, relTime } from "@/lib/live";
import GenieChat from "@/components/shell/v2/GenieChat";
import PageGuide from "@/components/shell/v2/PageGuide";

// Employee-centric, not a feature list. What Genie is doing for you (the loop),
// where it's growing you (the journey), and how you stay in control (settings).
const NAV = [
  // ── THE ONES A CUSTOMER USES ──
  // Twenty-four destinations is the reason a beginner opened this and could not
  // tell what their job was. These are the daily loop, in the order it happens:
  // read what happened, decide the day's cards, go hunting when you want more,
  // send something of your own, answer whoever wrote back, fix the plan if it is
  // wrong, check the work is real, connect what is missing.
  //
  // Nothing is deleted and nothing 404s. Everything else moved behind one
  // disclosure below, closed by default, because those screens are good and the
  // problem was never their quality — it was being asked to choose between
  // twenty-four of them before breakfast.
  { id: "today", label: "Today", icon: Icon.home },
  { id: "approvals", label: "Approvals", icon: Icon.tasks, countKey: "approvals" },
  // ── THE TWO THAT WERE HIDDEN, AND SHOULD NOT HAVE BEEN ──
  // Approvals is where Genie brings you three things it chose. It is not where the
  // volume is: three cards a day, with an article ranking above everything, works
  // out at roughly two emails a day against a sending allowance built for five
  // rising to thirty-five. Find clients is the other lane — you pick who to go
  // after, read the pitch written for each company, and send. Filing that behind
  // a disclosure made the queue look like the whole product, and the whole product
  // look far too slow to ever find anyone.
  { id: "prospects", label: "Find clients", icon: Icon.search },
  { id: "announce", label: "Send an update", icon: Icon.mail },
  { id: "inbox", label: "Leads", icon: Icon.inbox },
  { id: "strategy", label: "The plan", icon: Icon.target },
  { id: "worklog", label: "Everything Genie did", icon: Icon.history },
  { id: "connections", label: "Setup", icon: Icon.settings },
];

// Reachable, and not in the way. Most of these run on their own and put their
// output in Approvals — the owner does not need a door to Buyer Hunt, because
// Genie brings the buyer to them. The rest are tools somebody reaches for on
// purpose, perhaps once a month.
const MORE = [
  { section: "Get found" },
  { id: "growth", label: "Growth Score", icon: Icon.growth },
  { id: "aisearch", label: "AI Search Presence", icon: Icon.search },
  { id: "spread", label: "Spread your articles", icon: Icon.megaphone },
  { id: "site", label: "Website Setup", icon: Icon.globe },
  { id: "foundation", label: "Foundation links", icon: Icon.link },

  { section: "Win customers" },
  { id: "hunt", label: "Buyer Hunt", icon: Icon.crosshair },
  { id: "featured", label: "Get featured", icon: Icon.megaphone },
  { id: "conversations", label: "Conversations", icon: Icon.conversations },
  { id: "pipeline", label: "Deal Pipeline", icon: Icon.board },
  { id: "recover", label: "Revenue Recovery", icon: Icon.coins },

  { section: "Prove it pays" },
  { id: "impact", label: "Customer Impact", icon: Icon.bolt },
  { id: "sprint", label: "Proof Sprint", icon: Icon.flag },
  { id: "analytics", label: "What Genie Learned", icon: Icon.brain },

  { section: "Go wider" },
  { id: "team", label: "Your team", icon: Icon.globe, countKey: "team" },
  { id: "markets", label: "Market Testing", icon: Icon.megaphone },
  { id: "write", label: "Ask Genie to write", icon: Icon.write },
  { id: "video", label: "Video", icon: Icon.post },

  { section: "Control" },
  { id: "trust", label: "Trust Center", icon: Icon.check },
  { id: "settings", label: "Settings", icon: Icon.settings },
  { id: "howitworks", label: "How it works", icon: Icon.info },
  { id: "capabilities", label: "What Genie can do", icon: Icon.spark },
];

// Which ids live behind the disclosure, so landing on one opens it rather than
// leaving the owner looking at a rail that does not contain the page they are on.
const MORE_IDS = new Set(MORE.filter((i) => i.id).map((i) => i.id));

// The command bar's rotating prompt — shows the operator what they can ask for.
const initials = (n) => (String(n || "You").trim().split(/\s+/).map((w) => w[0]).join("") || "Y").slice(0, 2).toUpperCase();

const SEARCH_HINTS = [
  "Try: What content should I publish this week?",
  "Try: Show me my best performing pages",
  "Try: Draft a Reddit reply for r/coffee",
  "Try: Which buyers are asking for me right now?",
];

// ── WHAT THE TICKER SAYS WHEN NOTHING HAS HAPPENED ──
// It used to say six specific things: "Built your keyword strategy, 5 targets",
// "6 AI-search gaps found", "Gemini and OpenAI name you in 0 of 6 buyer
// answers", "Publishing content to Reddit in 2 min". None of it had happened.
// They sat in the LIVE bar at the top of every page, in the same type as real
// activity, with no way for an owner to tell which was which — and an owner who
// later works out that the live feed was inventing specifics about their own
// business has no reason to believe any other number in the product.
//
// A ticker with nothing in it says nothing, which is the honest thing for a
// business Genie has not started working on yet.
const IDLE_TICKER = [
  "Nothing yet — Genie's first run fills this",
];

export default function OperatorShell({ active = "today", children }) {
  const [theme, setTheme] = useState("day");
  const [activity, setActivity] = useState([]);
  const [counts, setCounts] = useState({ approvals: 0 });
  const [user, setUser] = useState({ name: "", entity: "" });
  const [chatOpen, setChatOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // mobile rail drawer
  // Closed by default. Opens itself when the page you are on lives inside it, so
  // the rail never fails to contain where you actually are.
  const [moreOpen, setMoreOpen] = useState(() => MORE_IDS.has(active));
  const [missingConns, setMissingConns] = useState([]);
  const [connDismissed, setConnDismissed] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [, setTick] = useState(0); // re-render so "Last updated" stays honest

  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setChatOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Rotate the command-bar prompt + tick the "last updated" label forward.
  useEffect(() => {
    const h = setInterval(() => setHintIdx((i) => (i + 1) % SEARCH_HINTS.length), 4200);
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => { clearInterval(h); clearInterval(t); };
  }, []);

  // Live data. Fetched on mount and — so "Auto-refreshes every 5 min" is true —
  // on a 5-minute interval. Theme + connect-nudge are read once.
  useEffect(() => {
    try { const t = localStorage.getItem("mg-theme"); if (t === "night" || t === "day") { setTheme(t); applyTheme(t); } } catch {}
    try { if (sessionStorage.getItem("mg-connect-dismissed")) setConnDismissed(true); } catch {}

    async function loadLive() {
      const [act, today, conns] = await Promise.all([
        fetchLive("/api/activity"),
        fetchLive("/api/today"),
        fetchLive("/api/connections/status"),
      ]);
      if (act.live && Array.isArray(act.data?.activity) && act.data.activity.length) {
        setActivity(act.data.activity.map((a) => ({ verb: a.verb, title: a.message, sub: a.detail || "", time: relTime(a.created_at) })));
      }
      if (today.live && today.data) {
        const data = today.data;
        if (data.approvalsCount != null) setCounts((c) => ({ ...c, approvals: data.approvalsCount }));
        if (data.teamLive != null) setCounts((c) => ({ ...c, team: data.teamLive }));
        if (data.entity || data.greetingName) setUser({ name: data.greetingName || "You", entity: data.entity?.name || "" });
      }
      if (conns.live && conns.data?.integrations) {
        const I = conns.data.integrations;
        const missing = [];
        // Ask whether the Google ACCOUNT is linked — not whether a Search Console
        // property has been matched yet (gsc_site fills in later).
        if (!I.google?.connected) missing.push({ label: "Google", why: "real keywords + send from your Gmail" });
        // WordPress is one way to have a blog, not the only one, and not the best
        // one. A site on any other host connects through the own-domain rewrite
        // (lib/own-blog.js), which publishes to THEIR domain — so asking a
        // business that already did that to "connect your blog" nags them
        // forever about a thing they finished, and implies the better setup does
        // not count.
        if (!I.wordpress?.connected && !I.own_blog?.connected) missing.push({ label: "your blog", why: "auto-publish articles" });
        setMissingConns(missing);
      }
      setLastSync(Date.now());
    }

    loadLive();
    const iv = setInterval(loadLive, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  function dismissConnect() { setConnDismissed(true); try { sessionStorage.setItem("mg-connect-dismissed", "1"); } catch {} }

  // Keep <html data-theme> authoritative so the pre-paint script (in layout) and
  // the in-app toggle never disagree — this is what kills the day→night flash.
  function applyTheme(t) { try { if (t === "night") document.documentElement.setAttribute("data-theme", "night"); else document.documentElement.removeAttribute("data-theme"); } catch {} }
  function pick(t) { setTheme(t); applyTheme(t); try { localStorage.setItem("mg-theme", t); } catch {} }

  // Genie's presence state — driven by REAL data, never decoration. Approvals
  // waiting wins (you have a decision to make); else a live stream = working;
  // else idle.
  const genieState = counts.approvals > 0 ? "alerting" : activity.length ? "working" : "idle";
  const working = activity.length > 0;
  // Real work only. When there is none, say so rather than inventing some.
  const realLines = activity.slice(0, 10).map((a) => ({ title: a.title, time: a.time })).filter((a) => a.title);
  const tickerLines = realLines.length ? realLines : IDLE_TICKER.map((t) => ({ title: t, time: "" }));

  // The rail's content — rendered once, used in the desktop aside AND the mobile
  // drawer, so navigation exists on every screen size.
  const railInner = (
    <>
      <div className="px-4 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--hair)" }}>
        <GenieWordmark size={21} />
        <button onClick={() => setNavOpen(false)} className="md:hidden mg-focus" style={{ color: "var(--fg-subtle)", background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label="Close menu"><Icon.x size={18} /></button>
      </div>
      <nav className="flex-1 overflow-y-auto thin-scroll px-2.5 py-3">
        {NAV.map((item) => <RailLink key={item.id} item={item} active={active} counts={counts} onGo={() => setNavOpen(false)} />)}

        {/* Everything else. One disclosure rather than eighteen more doors: these
            screens are good, and the problem was being asked to choose between
            twenty-four of them before breakfast. */}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className="mg-rail-item mg-focus w-full"
          style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <Icon.plus size={18} style={{ transform: moreOpen ? "rotate(45deg)" : "none", transition: "transform .15s" }} />
          <span>{moreOpen ? "Less" : "Everything else"}</span>
        </button>

        {moreOpen && (
          <div style={{ paddingLeft: 2 }}>
            {MORE.map((item, i) =>
              item.section ? (
                <p key={`s${i}`} className="px-2.5 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] mg-subtle">{item.section}</p>
              ) : (
                <RailLink key={item.id} item={item} active={active} counts={counts} onGo={() => setNavOpen(false)} />
              )
            )}
          </div>
        )}
      </nav>

      <div className="px-3 pb-3">
        <div className="mg-surface-quiet p-3.5">
          <div className="flex items-center gap-2">
            <span className="mg-live-dot" style={working ? undefined : { background: "var(--fg-subtle)", animation: "none" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{working ? "Genie is working" : "Genie is standing by"}</span>
          </div>
          <p className="mt-1.5 text-[12px] mg-muted leading-snug">{activity[0]?.title || "Run your first scan and I’ll get to work."}</p>
          {working && (
            <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
              <div className="h-full rounded-full" style={{ width: "62%", background: "linear-gradient(90deg,var(--mg-dawn-500),var(--signal-live))" }} />
            </div>
          )}
        </div>
      </div>

      <a href="/settings" className="mx-3 mb-3 flex items-center gap-2.5 p-2 rounded-xl mg-focus" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
        <span className="mg-tile" style={{ width: 32, height: 32, background: "var(--primary)", color: "var(--on-primary)", fontSize: 12, fontWeight: 700 }}>{(user.name || "Y").charAt(0).toUpperCase()}</span>
        <span className="text-left leading-tight flex-1 min-w-0">
          <span className="block text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{user.name || "Your account"}</span>
          <span className="block text-[11px] mg-subtle truncate">{user.entity || "Set up your entity"}</span>
        </span>
        <Icon.chevronRight size={15} />
      </a>
    </>
  );

  return (
    <div className="mg" data-theme={theme === "night" ? "night" : undefined}
         style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-ui)", overflow: "hidden" }}>
      <div className="flex-1 flex min-h-0">
        {/* ── COMMAND RAIL (desktop) ── */}
        <aside className="hidden md:flex flex-col shrink-0" style={{ width: 234, borderRight: "1px solid var(--hair)", background: "var(--surface)" }}>
          {railInner}
        </aside>

        {/* ── COMMAND RAIL (mobile drawer) ── */}
        {navOpen && (
          <div className="md:hidden" style={{ position: "fixed", inset: 0, zIndex: 50 }}>
            <div onClick={() => setNavOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(3,6,12,.5)", backdropFilter: "blur(2px)" }} />
            <aside className="flex flex-col mg-rise" style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "min(280px,86vw)", background: "var(--surface)", borderRight: "1px solid var(--hair)", boxShadow: "var(--shadow-3)" }}>
              {railInner}
            </aside>
          </div>
        )}

        {/* ── WORK-STREAM ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar + live ticker travel together as the sticky chrome. */}
          <div className="sticky top-0 z-20">
            <header className="mg-chrome flex items-center gap-3 px-4 sm:px-6" style={{ height: 60 }}>
              <button onClick={() => setNavOpen(true)} className="md:hidden mg-navtoggle mg-focus shrink-0" style={{ color: "var(--fg-muted)", background: "none", border: "none", cursor: "pointer", marginLeft: -10 }} aria-label="Open menu">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
              </button>
              <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                <PageGuide active={active} />
                <button onClick={() => setChatOpen(true)} className="mg-icon-btn mg-focus" title="Ask Genie (⌘K)" aria-label="Search"><Icon.search size={18} /></button>
                <a href={hrefFor("inbox")} className="mg-icon-btn mg-focus" style={{ position: "relative" }} title="Notifications" aria-label="Notifications">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                  {counts.approvals > 0 && <span style={{ position: "absolute", top: 7, right: 8, width: 8, height: 8, borderRadius: 999, background: "var(--signal-danger)", border: "2px solid var(--surface)" }} />}
                </a>
                <button onClick={() => pick(theme === "night" ? "day" : "night")} className="mg-icon-btn mg-focus" title="Toggle theme" aria-label="Toggle day / night">
                  {theme === "night"
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>}
                </button>
                <a href={hrefFor("settings")} className="flex items-center gap-2 mg-focus" style={{ borderRadius: 999, padding: 3 }} title="Account">
                  <span className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 999, background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700 }}>{initials(user?.name)}</span>
                  <span className="hidden md:block text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{user?.name || "You"}</span>
                  <Icon.chevronRight size={14} style={{ color: "var(--fg-subtle)", transform: "rotate(90deg)" }} />
                </a>
              </div>
            </header>

            {/* ── LIVE ACTIVITY TICKER — a news bar that scrolls right to left,
                seamlessly (the items are laid out twice and the track animates to
                -50%), pausing on hover. */}
            <div className="mg-ticker" role="marquee" aria-label="Live activity">
              <div className="mg-ticker-live"><span className="mg-live-dot" /> Live</div>
              <div className="mg-ticker-vp">
                <div className="mg-ticker-track">
                  {[...tickerLines, ...tickerLines].map((item, i) => (
                    <span className="mg-ticker-item" key={i} aria-hidden={i >= tickerLines.length}>
                      <Icon.spark size={13} />
                      <span>{item.title}</span>
                      {item.time && <span className="mg-num" style={{ color: "var(--fg-subtle)", fontSize: 12 }}>{item.time}</span>}
                      <span className="mg-ticker-sep" />
                    </span>
                  ))}
                </div>
              </div>
              <a href={hrefFor("growth")} className="mg-ticker-viewall mg-focus">View all activity</a>
            </div>
          </div>

          <main className="flex-1 overflow-y-auto overflow-x-hidden thin-scroll">
            {missingConns.length > 0 && !connDismissed && (
              <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5" style={{ background: "var(--accent-quiet)", borderBottom: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)" }}>
                <span className="mg-tile shrink-0" style={{ width: 24, height: 24, background: "var(--accent)", color: "#fff" }}><Icon.link size={13} /></span>
                <span className="text-[13px]" style={{ color: "var(--fg)" }}>
                  Connect <b style={{ color: "var(--fg)", fontWeight: 700 }}>{missingConns.map((m) => m.label).join(" & ")}</b> to make Genie more powerful, {missingConns.map((m) => m.why).join(", ")}.
                </span>
                <a href="/connections" className="mg-btn mg-btn--primary ml-auto shrink-0" style={{ fontSize: 12, padding: ".34rem .8rem" }}>Connect</a>
                <button onClick={dismissConnect} className="mg-focus shrink-0" style={{ color: "var(--accent-ink)", fontSize: 17, lineHeight: 1, padding: "0 4px", background: "none", border: "none", cursor: "pointer" }} aria-label="Dismiss">×</button>
              </div>
            )}
            <div key={active} className="mg-rise px-4 sm:px-6 py-4 sm:py-5 xl:px-8 min-w-0" style={{ overflowWrap: "break-word", maxWidth: "100%" }}>{children}</div>
          </main>
        </div>
      </div>

      <GenieChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

function RailLink({ item, active, counts, onGo }) {
  const n = item.countKey ? counts?.[item.countKey] : item.count;
  return (
    <a
      href={hrefFor(item.id)}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener noreferrer" : undefined}
      onClick={onGo}
      className="mg-rail-item mg-focus"
      data-active={active === item.id}
    >
      <item.icon size={18} />
      <span>{item.label}</span>
      {n != null && n > 0 && <span className="mg-rail-count">{n}</span>}
    </a>
  );
}

function hrefFor(id) {
  const map = {
    today: "/today", approvals: "/approvals", team: "/team", "test-launch": "/test-launch", write: "/write", spread: "/spread", hunt: "/hunt", recover: "/recover", conversations: "/conversations", video: "/video", prospects: "/prospects", featured: "/featured", inbox: "/inbox", pipeline: "/pipeline", sprint: "/sprint", impact: "/impact",
    growth: "/growth", aisearch: "/ai-search", analytics: "/learning", foundation: "/foundation", site: "/site", markets: "/markets",
    trust: "/trust", connections: "/connections", settings: "/settings", howitworks: "/how-it-works", capabilities: "/capabilities",
    strategy: "/strategy",
  };
  // Only ids whose route differs from the id need an entry. Falling back to
  // "/today" meant a nav item missing from this map sent the owner silently to
  // the wrong page instead of failing loudly — which is exactly what happened
  // to The plan, and could not be seen from the nav list itself.
  return map[id] || `/${id}`;
}
