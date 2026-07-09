"use client";

// ── THE "GENIE IS WORKING" LIVE FEED ──
// Makes the invisible engine visible. Narrates what Genie has been doing —
// scanning, discovering, writing, learning — as a living stream with a pulse.
// This is the wow: users FEEL they hired an employee who never stops.

import { useState, useEffect, useRef } from "react";

const VERB_STYLE = {
  scanning:   { ring: "#7C3AED", pulse: true },
  discovered: { ring: "#059669", pulse: false },
  writing:    { ring: "#4F46E5", pulse: true },
  staged:     { ring: "#7C3AED", pulse: false },
  published:  { ring: "#059669", pulse: false },
  replied:    { ring: "#7C3AED", pulse: false },
  learning:   { ring: "#4F46E5", pulse: true },
  traction:   { ring: "#F59E0B", pulse: false },
  retired:    { ring: "#8A8FA3", pulse: false },
  keywords:   { ring: "#7C3AED", pulse: false },
};

export default function ActivityFeed({ host, live = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  async function load() {
    try {
      const url = host ? `/api/activity?host=${encodeURIComponent(host)}&limit=25` : "/api/activity?limit=25";
      const res = await fetch(url);
      const j = await res.json();
      if (j.ok) setItems(j.activity || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    if (live) { timer.current = setInterval(load, 8000); return () => clearInterval(timer.current); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, live]);

  if (loading) {
    return <div className="rounded-2xl border border-ink-900/[0.06] bg-surface p-5 shadow-sm animate-pulse h-40" />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-ink-900/[0.06] bg-surface p-6 shadow-sm text-center">
        <div className="flex items-center justify-center gap-2 text-ink-400">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-violet/60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-violet" />
          </span>
          <span className="text-sm">Genie is standing by — run a scan and watch him work.</span>
        </div>
      </div>
    );
  }

  const newest = items[0];
  const rest = items.slice(1);

  return (
    <div className="rounded-2xl border border-ink-900/[0.06] bg-surface shadow-sm overflow-hidden">
      {/* Live header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-ink-900/[0.05]">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <p className="text-sm font-bold text-ink-900">Genie is working</p>
        <span className="text-[11px] text-ink-400 ml-auto">{timeAgo(newest.created_at)}</span>
      </div>

      {/* Newest — highlighted with typewriter */}
      <div className="px-5 py-4">
        <FeedRow item={newest} highlight />
      </div>

      {/* History */}
      {rest.length > 0 && (
        <div className="px-5 pb-4 space-y-3 max-h-72 overflow-y-auto thin-scroll">
          {rest.map((it) => <FeedRow key={it.id} item={it} />)}
        </div>
      )}
    </div>
  );
}

function FeedRow({ item, highlight = false }) {
  const style = VERB_STYLE[item.verb] || { ring: "#7C3AED", pulse: false };
  return (
    <div className="flex items-start gap-3">
      <div className="relative shrink-0 mt-0.5">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg text-sm" style={{ background: `${style.ring}14` }}>
          {item.icon || "•"}
        </span>
        {highlight && style.pulse && (
          <span className="absolute -inset-0.5 rounded-lg animate-ping" style={{ background: `${style.ring}22` }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${highlight ? "font-semibold text-ink-900" : "text-ink-700"}`}>
          {highlight ? <Typewriter text={item.message} /> : item.message}
        </p>
        {item.detail && <p className="text-[11px] text-ink-400 truncate">{item.detail}</p>}
      </div>
      {!highlight && <span className="text-[10px] text-ink-400 shrink-0">{timeAgo(item.created_at)}</span>}
    </div>
  );
}

function Typewriter({ text }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [text]);
  return <>{shown}<span className="inline-block w-1.5 h-3.5 bg-brand-violet/70 ml-0.5 animate-pulse align-middle" style={{ opacity: shown.length < text.length ? 1 : 0 }} /></>;
}

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
