"use client";

// ── OPERATOR SHELL (V2) ──
// The operating system of an AI marketing employee. Full-bleed, three zones:
//   • Command rail (left)  — where you go
//   • Work-stream (center) — what Genie accomplished / what you approve
//   • Live activity (right)— Genie working, right now
// Day is the default (premium, calm reveal). Night is Mission Control.
// Live-with-fallback: pulls the real activity feed + entity + counts when signed
// in; falls back to representative data so the public preview always renders.

import { useState, useEffect } from "react";
import Icon from "@/components/ui/Icon";
import { GenieMark, GenieLockup } from "@/components/brand/GenieMark";
import { Kbd } from "@/components/ui/v2/primitives";
import { fetchLive, relTime } from "@/lib/live";
import GenieChat from "@/components/shell/v2/GenieChat";

// Employee-centric, not a feature list. What Genie is doing for you (the loop),
// where it's growing you (Growth), and how you stay in control (Control).
const NAV = [
  { section: "Your employee" },
  { id: "today", label: "Today", icon: Icon.home },
  { id: "approvals", label: "Approvals", icon: Icon.tasks, countKey: "approvals" },
  { id: "conversations", label: "Conversations", icon: Icon.conversations },
  { section: "Growth" },
  { id: "growth", label: "Growth", icon: Icon.growth },
  { id: "aisearch", label: "AI Search", icon: Icon.spark },
  { id: "impact", label: "Impact", icon: Icon.bolt },
  { id: "analytics", label: "Intelligence", icon: Icon.brain },
  { section: "Control" },
  { id: "trust", label: "Trust Center", icon: Icon.check },
  { id: "connections", label: "Connections", icon: Icon.connect },
];

const VERB = {
  scanning: { icon: Icon.search, tint: "ink" }, discovered: { icon: Icon.spark, tint: "dawn" },
  writing: { icon: Icon.write, tint: "blue" }, staged: { icon: Icon.tasks, tint: "dawn" },
  published: { icon: Icon.growth, tint: "emerald" }, replied: { icon: Icon.reply, tint: "blue" },
  learning: { icon: Icon.brain, tint: "dawn" }, traction: { icon: Icon.growth, tint: "emerald" },
  keywords: { icon: Icon.target, tint: "dawn" }, working: { icon: Icon.bolt, tint: "ink" },
};

function tintOf(name) {
  switch (name) {
    case "emerald": return { bg: "var(--signal-live-soft)", fg: "var(--signal-live-ink)" };
    case "blue": return { bg: "var(--signal-info-soft)", fg: "var(--signal-info)" };
    case "dawn": return { bg: "var(--accent-quiet)", fg: "var(--accent-ink)" };
    case "reddit": return { bg: "rgba(255,69,0,.12)", fg: "#F04A1A" };
    default: return { bg: "var(--surface-sunken)", fg: "var(--fg-muted)" };
  }
}

export default function OperatorShell({ active = "today", children }) {
  const [theme, setTheme] = useState("day");
  const [activity, setActivity] = useState([]);
  const [counts, setCounts] = useState({ approvals: 0 });
  const [user, setUser] = useState({ name: "", entity: "" });
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setChatOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try { const t = localStorage.getItem("mg-theme"); if (t === "night" || t === "day") setTheme(t); } catch {}
    (async () => {
      const { data, live } = await fetchLive("/api/activity");
      if (live && Array.isArray(data?.activity) && data.activity.length) {
        setActivity(data.activity.map((a) => ({ verb: a.verb, title: a.message, sub: a.detail || "", time: relTime(a.created_at) })));
      }
    })();
    (async () => {
      const { data, live } = await fetchLive("/api/today");
      if (live && data) {
        if (data.approvalsCount != null) setCounts((c) => ({ ...c, approvals: data.approvalsCount }));
        if (data.entity || data.greetingName) setUser({ name: data.greetingName || "You", entity: data.entity?.name || "" });
      }
    })();
  }, []);

  function pick(t) { setTheme(t); try { localStorage.setItem("mg-theme", t); } catch {} }

  return (
    <div className="mg" data-theme={theme === "night" ? "night" : undefined}
         style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-ui)", overflow: "hidden" }}>
      <div className="flex-1 flex min-h-0">
        {/* ── COMMAND RAIL ── */}
        <aside className="hidden md:flex flex-col shrink-0" style={{ width: 234, borderRight: "1px solid var(--hair)", background: "var(--surface)" }}>
          <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--hair)" }}><GenieLockup size={34} live /></div>
          <nav className="flex-1 overflow-y-auto thin-scroll px-2.5 py-3">
            {NAV.map((item, i) =>
              item.section ? (
                <p key={i} className="px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] mg-subtle">{item.section}</p>
              ) : (
                <a key={item.id} href={hrefFor(item.id)} className="mg-rail-item mg-focus" data-active={active === item.id}>
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  {(item.countKey ? counts[item.countKey] : item.count) != null && (
                    <span className="mg-rail-count">{item.countKey ? counts[item.countKey] : item.count}</span>
                  )}
                </a>
              )
            )}
          </nav>

          <div className="px-3 pb-3">
            <div className="mg-surface-quiet p-3.5">
              <div className="flex items-center gap-2">
                <span className="mg-live-dot" style={activity.length ? undefined : { background: "var(--fg-subtle)", animation: "none" }} />
                <span className="text-[12.5px] font-semibold" style={{ color: "var(--fg)" }}>{activity.length ? "Genie is working" : "Genie is standing by"}</span>
              </div>
              <p className="mt-1.5 text-[11.5px] mg-muted leading-snug">{activity[0]?.title || "Run your first scan and I’ll get to work."}</p>
            </div>
          </div>

          <button className="mx-3 mb-3 flex items-center gap-2.5 p-2 rounded-xl mg-focus" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
            <span className="mg-tile" style={{ width: 32, height: 32, background: "var(--primary)", color: "var(--on-primary)", fontSize: 12, fontWeight: 700 }}>{(user.name || "Y").charAt(0).toUpperCase()}</span>
            <span className="text-left leading-tight flex-1 min-w-0">
              <span className="block text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{user.name}</span>
              <span className="block text-[11px] mg-subtle truncate">{user.entity || "Set up your entity"}</span>
            </span>
            <Icon.chevronRight size={15} />
          </button>
        </aside>

        {/* ── WORK-STREAM ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="mg-chrome sticky top-0 z-20 flex items-center gap-3 px-6" style={{ height: 60 }}>
            <button onClick={() => setChatOpen(true)} className="mg-searchbar mg-focus" style={{ width: 340, maxWidth: "42vw" }}>
              <Icon.search size={16} />
              <span className="flex-1 text-left">Ask Genie, or tell it what to do…</span>
              <span className="flex items-center gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
            </button>
            <div className="ml-auto flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2.5">
                <GenieMark size={30} live />
                <div className="leading-tight">
                  <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>AI Operator</p>
                  <p className="text-[10.5px] flex items-center gap-1" style={{ color: "var(--signal-live-ink)" }}><span className="mg-live-dot" /> Live · working</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 p-0.5 rounded-full" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
                {[["day", "Day"], ["night", "Night"]].map(([t, l]) => (
                  <button key={t} onClick={() => pick(t)} className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full transition mg-focus"
                    style={theme === t ? { background: "var(--primary)", color: "var(--on-primary)" } : { color: "var(--fg-muted)" }}>{l}</button>
                ))}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto thin-scroll"><div className="px-6 py-6 xl:px-8">{children}</div></main>
        </div>

        {/* ── LIVE ACTIVITY ── */}
        <aside className="hidden xl:flex flex-col shrink-0" style={{ width: 322, borderLeft: "1px solid var(--hair)", background: "var(--surface)" }}>
          <div className="px-5 pt-5 pb-3" style={{ borderBottom: "1px solid var(--hair)" }}>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Live Activity</h2>
              <span className="mg-live-dot" />
            </div>
            <p className="mt-0.5 text-[12px] mg-muted">Everything Genie is doing, right now.</p>
          </div>
          <div className="flex-1 overflow-y-auto thin-scroll px-3 py-2">
            {activity.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="text-[12.5px] mg-muted">No activity yet.</p>
                <p className="text-[11.5px] mg-subtle mt-1">Your first scan starts the stream — everything I do shows up here, live.</p>
              </div>
            )}
            {activity.map((a, i) => {
              const v = VERB[a.verb] || VERB.working;
              const t = tintOf(a.tint || v.tint);
              const IconC = v.icon;
              return (
                <div key={i} className="mg-activity-row mg-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <span className="mg-tile" style={{ width: 34, height: 34, background: t.bg, color: t.fg }}><IconC size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold leading-tight" style={{ color: "var(--fg)" }}>{a.title}</p>
                    {a.sub && <p className="text-[11.5px] mg-muted truncate leading-tight mt-0.5">{a.sub}</p>}
                  </div>
                  <span className="text-[10.5px] mg-subtle shrink-0 mg-num">{a.time}</span>
                </div>
              );
            })}
          </div>
          <div className="p-3.5" style={{ borderTop: "1px solid var(--hair)" }}>
            <div className="mg-surface-quiet p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mg-subtle">Genie’s focus right now</p>
              <div className="mt-2.5 flex items-center gap-3">
                <Radar />
                <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--fg)" }}>{activity[0]?.title || "Standing by — run your first scan to begin."}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <GenieChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

function Radar() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0" aria-hidden>
      <circle cx="22" cy="22" r="20" fill="none" stroke="var(--hair)" strokeWidth="1" />
      <circle cx="22" cy="22" r="13" fill="none" stroke="var(--hair)" strokeWidth="1" />
      <circle cx="22" cy="22" r="6" fill="none" stroke="var(--hair)" strokeWidth="1" />
      <circle className="ap-halo" cx="22" cy="22" r="8" fill="var(--accent)" opacity="0.18" />
      <circle cx="22" cy="22" r="2.4" fill="var(--accent)" />
      <circle cx="33" cy="15" r="1.8" fill="var(--signal-live)" />
    </svg>
  );
}

function hrefFor(id) {
  const map = {
    today: "/today", approvals: "/approvals", conversations: "/conversations", impact: "/impact",
    growth: "/growth", aisearch: "/ai-search", analytics: "/learning",
    trust: "/trust", connections: "/connections",
  };
  return map[id] || "/today";
}
