"use client";

// components/ui/v2/SuggestChips.js
// ── THE ROW OF THINGS WORTH SEARCHING ──
// One component for all three search boxes (Buyer Hunt, Get Featured, Find
// clients) so they behave identically: tap a chip to fill the box and run it, or
// ignore them and type your own. Typing is never blocked or replaced — these are
// a starting point for someone who does not already think in search terms, which
// is most owners.
//
// Two modes:
//   pick   — replaces what is in the box and runs (a niche is one thing)
//   toggle — adds or removes from a comma-separated list (Buyer Hunt poaches
//            from several rivals at once, so replacing would be wrong)
//
// Each chip shows where it came from on hover. Provenance is the whole point: a
// suggestion the owner cannot trace reads as a guess, and they have no way to
// tell a good one from a bad one.

import { useEffect, useState } from "react";

export default function SuggestChips({
  surface,                 // "featured" | "prospects" | "hunt"
  mode = "pick",
  onPick,                  // (text) => void          — mode "pick"
  selected = "",           // current comma list       — mode "toggle"
  onToggle,                // (nextCommaList) => void  — mode "toggle"
  label = "Try:",
  note = "",
  emptyNote = "",
}) {
  const [items, setItems] = useState(null);
  const [needsScan, setNeedsScan] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await fetch(`/api/suggest?for=${surface}`, { cache: "no-store" }).then((r) => r.json());
        if (!alive) return;
        if (j?.ok) { setItems(j.suggestions || []); setNeedsScan(!!j.needsScan); }
        else setItems([]);
      } catch { if (alive) setItems([]); }
    })();
    return () => { alive = false; };
  }, [surface]);

  // Nothing is shown while loading and nothing is shown when there is nothing
  // worth showing. A row that flashes placeholder chips and then changes them is
  // worse than a row that simply appears.
  if (items === null || items.length === 0) {
    if (needsScan && emptyNote) return <p className="mt-2.5 text-[12.5px] mg-subtle">{emptyNote}</p>;
    return null;
  }

  const chosen = new Set(
    String(selected || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );

  function handle(text) {
    if (mode === "toggle") {
      const list = String(selected || "").split(",").map((s) => s.trim()).filter(Boolean);
      const at = list.findIndex((s) => s.toLowerCase() === text.toLowerCase());
      if (at >= 0) list.splice(at, 1); else list.push(text);
      onToggle?.(list.join(", "));
      return;
    }
    onPick?.(text);
  }

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2 flex-wrap text-[12.5px] mg-subtle">
        <span>{label}</span>
        {items.map((s) => {
          const on = chosen.has(s.text.toLowerCase());
          return (
            <button
              key={s.text}
              type="button"
              onClick={() => handle(s.text)}
              title={s.why || ""}
              className={`mg-pill mg-focus${on ? " mg-pill--dawn" : ""}`}
              style={{ cursor: "pointer" }}
            >
              {on && <span aria-hidden>✓</span>}
              {s.text}
              {/* A number only ever appears when it is a measured one, from
                  Google's own data. An estimate with a number on it would read
                  as fact. */}
              {s.volume > 0 && (
                <span className="mg-num" style={{ opacity: 0.65, fontWeight: 500 }}>
                  {compact(s.volume)}/mo
                </span>
              )}
            </button>
          );
        })}
      </div>
      {note && <p className="mt-1.5 text-[12px] mg-subtle" style={{ maxWidth: "var(--measure)" }}>{note}</p>}
    </div>
  );
}

function compact(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${Math.round(v / 100000) / 10}m`;
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`;
  return String(v);
}
