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
// in; falls back to representative data so the public preview always renders.

import { useState, useEffect } from "react";
import Icon from "@/components/ui/Icon";
import { GenieMark, GenieLockup } from "@/components/brand/GenieMark";
import { Kbd } from "@/components/ui/v2/primitives";
import { fetchLive, relTime } from "@/lib/live";
import GenieChat from "@/components/shell/v2/GenieChat";
import PageGuide from "@/components/shell/v2/PageGuide";

// Employee-centric, not a feature list. What Genie is doing for you (the loop),
// where it's growing you (the journey), and how you stay in control (settings).
const NAV = [
  { section: "Your employee" },
  { id: "today", label: "Today", icon: Icon.home },
  { id: "approvals", label: "Approvals", icon: Icon.tasks, countKey: "approvals" },
  { id: "hunt", label: "Buyer Hunt", icon: Icon.crosshair },
  { id: "recover", label: "Revenue Recovery", icon: Icon.coins },
  { id: "conversations", label: "Conversations", icon: Icon.conversations },
  { id: "prospects", label: "Find clients", icon: Icon.target },
  { id: "featured", label: "Get featured", icon: Icon.megaphone },
  { id: "inbox", label: "Inbox", icon: Icon.inbox },
  { id: "pipeline", label: "Deal Pipeline", icon: Icon.board },
  { id: "sprint", label: "Proof Sprint", icon: Icon.flag },
  { section: "Growth journey" },
  { id: "growth", label: "Growth Score", icon: Icon.growth },
  { id: "aisearch", label: "AI Search Presence", icon: Icon.search },
  { id: "impact", label: "Customer Impact", icon: Icon.bolt },
  { id: "analytics", label: "What Genie Learned", icon: Icon.brain },
  { id: "foundation", label: "Foundation links", icon: Icon.link },
  { id: "site", label: "Website Setup", icon: Icon.globe },
  { id: "markets", label: "Market Testing", icon: Icon.megaphone },
  { section: "Settings" },
  { id: "connections", label: "Connections", icon: Icon.link },
  { id: "trust", label: "Trust Center", icon: Icon.check },
  { id: "settings", label: "Settings", icon: Icon.settings },
  { id: "howitworks", label: "How it works", icon: Icon.info },
  { id: "capabilities", label: "What Genie can do", icon: Icon.spark },
];

// The command bar's rotating prompt — shows the operator what they can ask for.
const initials = (n) => (String(n || "You").trim().split(/\s+/).map((w) => w[0]).join("") || "Y").slice(0, 2).toUpperCase();

const SEARCH_HINTS = [
  "Try: What content should I publish this week?",
  "Try: Show me my best performing pages",
  "Try: Draft a Reddit reply for r/coffee",
  "Try: Which buyers are asking for me right now?",
];

// When there's no live stream (public preview / a fresh account), the ticker
// still reads like an employee at work. Representative, and de-dashed on purpose.
const FALLBACK_TICKER = [
  "Built your keyword strategy, 5 targets",
  "6 AI-search gaps found, plans drafted to win them",
  "Gemini and OpenAI name you in 0 of 6 buyer answers",
  "Hunting buyer intent across 5 surfaces",
  "Learned 1 new thing about your buyers from Reddit",
  "Publishing content to Reddit in 2 min",
];

export default function OperatorShell({ active = "today", children }) {
  const [theme, setTheme] = useState("day");
  const [activity, setActivity] = useState([]);
  const [counts, setCounts] = useState({ approvals: 0 });
  const [user, setUser] = useState({ name: "", entity: "" });
  const [chatOpen, setChatOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // mobile rail drawer
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
        if (data.entity || data.greetingName) setUser({ name: data.greetingName || "You", entity: data.entity?.name || "" });
      }
      if (conns.live && conns.data?.integrations) {
        const I = conns.data.integrations;
        const missing = [];
        // Ask whether the Google ACCOUNT is linked — not whether a Search Console
        // property has been matched yet (gsc_site fills in later).
        if (!I.google?.connected) missing.push({ label: "Google", why: "real keywords + send from your Gmail" });
        if (!I.wordpress?.connected) missing.push({ label: "your blog", why: "auto-publish articles" });
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
  const tickerLines = working ? activity.slice(0, 10).map((a) => ({ title: a.title, time: a.time })).filter((a) => a.title) : FALLBACK_TICKER.map((t) => ({ title: t, time: "" }));

  // The rail's content — rendered once, used in the desktop aside AND the mobile
  // drawer, so navigation exists on every screen size.
  const railInner = (
    <>
      <div className="px-4 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--hair)" }}>
        <GenieLockup size={42} live />
        <button onClick={() => setNavOpen(false)} className="md:hidden mg-focus" style={{ color: "var(--fg-subtle)", background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label="Close menu"><Icon.x size={18} /></button>
      </div>
      <nav className="flex-1 overflow-y-auto thin-scroll px-2.5 py-3">
        {NAV.map((item, i) =>
          item.section ? (
            <p key={i} className="px-2.5 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] mg-subtle">{item.section}</p>
          ) : (
            <a key={item.id} href={hrefFor(item.id)} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} onClick={() => setNavOpen(false)} className="mg-rail-item mg-focus" data-active={active === item.id}>
              <item.icon size={18} />
              <span>{item.label}</span>
              {(item.countKey ? counts[item.countKey] : item.count) != null && (item.countKey ? counts[item.countKey] : item.count) > 0 && (
                <span className="mg-rail-count">{item.countKey ? counts[item.countKey] : item.count}</span>
              )}
            </a>
          )
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

function hrefFor(id) {
  const map = {
    today: "/today", approvals: "/approvals", hunt: "/hunt", recover: "/recover", conversations: "/conversations", prospects: "/prospects", featured: "/featured", inbox: "/inbox", pipeline: "/pipeline", sprint: "/sprint", impact: "/impact",
    growth: "/growth", aisearch: "/ai-search", analytics: "/learning", foundation: "/foundation", site: "/site", markets: "/markets",
    trust: "/trust", connections: "/connections", settings: "/settings", howitworks: "/how-it-works", capabilities: "/capabilities",
  };
  return map[id] || "/today";
}
