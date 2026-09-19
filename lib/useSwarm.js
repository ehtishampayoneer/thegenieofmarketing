"use client";

// lib/useSwarm.js
// One live read of the three teams, shared by Today and Your team.
// It polls only while someone is actually looking at the page, refreshes the
// moment the tab comes back, and gives up on a 401 rather than hammering the
// server from a signed-out tab.

import { useEffect, useState } from "react";

export function useSwarm(every = 8000) {
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true, stop = false;
    const load = async () => {
      if (stop || document.hidden) return;
      try {
        const res = await fetch("/api/swarm/status", { cache: "no-store" });
        if (res.status === 401) { stop = true; return; }
        const j = await res.json();
        if (alive && j?.ok) setS(j);
      } catch {}
    };
    load();
    const t = setInterval(load, every);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; stop = true; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [every]);
  return s;
}
