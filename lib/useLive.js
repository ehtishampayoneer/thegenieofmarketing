"use client";

// ── ONE DATA-STATE MODEL FOR EVERY SCREEN ──
// Replaces the old "always fall back to demo data" pattern. A page is in exactly
// one honest state: loading, real (has data), empty (signed in, engine reachable,
// but nothing generated yet), or disconnected (no session / engine unreachable).
// No sample data is ever shown. The first scan is what fills these screens.

import { useEffect, useState } from "react";

export function useLive(url, emptyWhen) {
  const [state, setState] = useState("loading"); // loading | real | empty | disconnected
  const [data, setData] = useState(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) { if (on) setState("disconnected"); return; }
        const j = await res.json();
        if (!j || j.ok === false) { if (on) setState("disconnected"); return; }
        if (!on) return;
        const empty = typeof emptyWhen === "function" ? emptyWhen(j) : false;
        setData(j);
        setState(empty ? "empty" : "real");
      } catch { if (on) setState("disconnected"); }
    })();
    return () => { on = false; };
  }, [url]);

  return { data, state, setData };
}
