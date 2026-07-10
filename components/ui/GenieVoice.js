"use client";

// Genie's voice — text that appears letter-by-letter like he's writing it live,
// plus the growing "Genie strength" bar. Fun, warm, alive.

import { useState, useEffect, useRef } from "react";
import { LogoMark } from "@/components/ui/Logo";

// Letter-by-letter narration. Calls onDone when finished.
export function GenieSays({ text, speed = 22, className = "", onDone, showCursor = true }) {
  const [shown, setShown] = useState("");
  const doneRef = useRef(false);
  useEffect(() => {
    setShown(""); doneRef.current = false;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        if (!doneRef.current) { doneRef.current = true; onDone?.(); }
      }
    }, speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const typing = shown.length < text.length;
  return (
    <span className={className}>
      {shown}
      {showCursor && typing && <span className="inline-block w-[2px] h-[1em] bg-accent ml-0.5 align-middle animate-soft-pulse" />}
    </span>
  );
}

// Genie avatar + a speech line, for wizard headers.
export function GenieLine({ text, size = 44, className = "", onDone }) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="shrink-0 animate-scale-in"><LogoMark size={size} /></div>
      <p className="text-xl sm:text-2xl font-bold text-ink leading-snug pt-1">
        <GenieSays text={text} onDone={onDone} />
      </p>
    </div>
  );
}

// The growing strength bar — "Genie gets stronger as you connect."
export function StrengthBar({ value = 0, className = "" }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplay(value), 100);
    return () => clearTimeout(t);
  }, [value]);
  const label = value < 25 ? "Just getting started" : value < 55 ? "Warming up" : value < 80 ? "Getting powerful" : value < 100 ? "Nearly unstoppable" : "Full power ⚡";
  // Red → amber → green by progress.
  const color = value < 34 ? "#E5484D" : value < 67 ? "#F5A623" : "#1E9E6A";
  const labelColor = value < 34 ? "#E5484D" : value < 67 ? "#C77700" : "#127350";
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Genie's power</span>
        <span className="text-xs font-bold" style={{ color: labelColor }}>{label}</span>
      </div>
      <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden">
        <div
          className="h-full rounded-full relative"
          style={{
            width: `${Math.min(100, display)}%`,
            background: color,
            transition: "width 1s cubic-bezier(0.2,0.8,0.2,1), background 0.6s ease",
          }}
        >
          <span className="absolute inset-0 animate-soft-pulse" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }} />
        </div>
      </div>
    </div>
  );
}
