"use client";

// The Aware Orb — Genie's living presence. State-driven, defined up front.
// states: idle | thinking | suggesting | attention | working
export default function AwareOrb({ state = "idle", count = 0, size = 28 }) {
  const cls =
    state === "thinking" ? "orb orb-thinking" :
    state === "working" ? "orb orb-idle orb-working" :
    state === "attention" ? "orb orb-attention" :
    "orb orb-idle"; // idle + suggesting share the calm orb; suggesting adds a badge

  const showBadge = (state === "suggesting" || state === "attention") && count > 0;

  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span className={cls} style={{ width: size, height: size }} />
      {showBadge && (
        <span
          className={`badge-pop absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
            state === "attention" ? "bg-red-500" : "bg-brand-violet"
          }`}
        >
          {count}
        </span>
      )}
    </span>
  );
}
