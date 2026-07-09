"use client";

// ── THE GENIE UI KIT ──
// One cohesive component language (Linear/Stripe light-premium) used across
// every screen so the product reads as ONE crafted thing, not scattered pages.
// The Aperture (violet→dawn) is the single signature accent against clean white.

import { useEffect, useState, useRef } from "react";

// Card — the atom. Soft shadow, hairline border, gentle lift on hover.
export function Card({ children, className = "", interactive = false, rise = false, ...rest }) {
  return (
    <div className={`card-premium ${interactive ? "card-interactive cursor-pointer" : ""} ${rise ? "animate-rise" : ""} ${className}`} {...rest}>
      {children}
    </div>
  );
}

// Section header — consistent title + subtitle + optional action.
export function SectionHeader({ title, subtitle, action, className = "" }) {
  return (
    <div className={`flex items-end justify-between gap-3 flex-wrap ${className}`}>
      <div>
        <h2 className="text-lg font-bold text-ink-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-ink-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// Primary button — the one confident CTA style.
export function Button({ children, variant = "primary", size = "md", className = "", ...rest }) {
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3 text-base" };
  const variants = {
    primary: "btn-primary",
    ghost: "bg-surface border border-hairline text-ink-700 hover:border-ink-200 rounded-xl font-medium",
    subtle: "bg-surface2 text-ink-600 hover:bg-canvas rounded-xl font-medium",
    danger: "bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded-xl font-medium",
  };
  return <button className={`${variants[variant]} ${sizes[size]} transition ${className}`} {...rest}>{children}</button>;
}

// Badge / pill — consistent status chips.
export function Badge({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "bg-surface2 text-ink-600 border-hairline",
    violet: "bg-brand-violet/[0.08] text-brand-violet border-brand-violet/20",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    red: "bg-red-50 text-red-600 border-red-200",
  };
  return <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${tones[tone]} ${className}`}>{children}</span>;
}

// Animated count-up number — "rich & alive".
export function CountUp({ value = 0, duration = 900, className = "", suffix = "" }) {
  const [n, setN] = useState(0);
  const raf = useRef();
  useEffect(() => {
    const start = performance.now();
    const from = 0, to = Number(value) || 0;
    function tick(t) {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (to - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span className={className}>{n.toLocaleString()}{suffix}</span>;
}

// Stat block — big number + label, used in summaries.
export function Stat({ value, label, tone = "ink", animate = true, suffix = "" }) {
  const colors = { ink: "text-ink-900", violet: "text-brand-violet", emerald: "text-emerald-600", amber: "text-amber-600", red: "text-red-500" };
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold font-mono leading-none ${colors[tone]}`}>
        {animate ? <CountUp value={value} suffix={suffix} /> : <>{value}{suffix}</>}
      </p>
      <p className="mt-1 text-[11px] text-ink-400">{label}</p>
    </div>
  );
}

// Live dot — the pulsing "active" indicator.
export function LiveDot({ tone = "emerald" }) {
  const c = { emerald: "bg-emerald-500", violet: "bg-brand-violet", amber: "bg-amber-500" }[tone];
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c} opacity-60`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${c}`} />
    </span>
  );
}

// Progress bar — consistent thin gradient bar.
export function Progress({ value = 0, tone = "violet", className = "" }) {
  const g = { violet: "linear-gradient(90deg,#7C3AED,#4F46E5)", emerald: "#059669", amber: "#F59E0B", blue: "#2563EB" }[tone];
  return (
    <div className={`h-1.5 rounded-full bg-canvas overflow-hidden ${className}`}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: g, transition: "width .8s cubic-bezier(0.2,0.8,0.2,1)" }} />
    </div>
  );
}

// Skeleton loader.
export function Skeleton({ className = "" }) {
  return <div className={`shimmer rounded-xl ${className}`} />;
}
