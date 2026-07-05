"use client";

import { useState } from "react";
import Rail from "./Rail";
import GeniePanel from "./GeniePanel";
import AwareOrb from "./AwareOrb";

// Full-width Genie Status Strip state machine (mirrors the scan-page one).
const STATUS_STATES = {
  idle: { cls: "bg-blue-50 border-blue-200 text-blue-800", icon: "🔵" },
  pending_approval: { cls: "bg-amber-50 border-amber-200 text-amber-800", icon: "🟡" },
  opportunity: { cls: "bg-emerald-50 border-emerald-200 text-emerald-800", icon: "🟢" },
  attention: { cls: "bg-red-50 border-red-200 text-red-800", icon: "🔴" },
  working: { cls: "bg-brand-violet/5 border-brand-violet/20 text-brand-violet", icon: "⏳" },
};

export default function AppShell({
  nav = "home",
  businesses = [],
  activeHost,
  onSelectBusiness,
  status, // { state, message, actionable, onAct }
  genie = {}, // { host, contextChips, quickActions, suggestionCount }
  children,
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const st = STATUS_STATES[status?.state] || STATUS_STATES.idle;

  return (
    <div className="h-screen flex flex-col bg-canvas overflow-hidden">
      {/* Status strip — full width, above everything */}
      <div className={`border-b px-4 sm:px-6 py-2.5 flex items-center gap-3 ${st.cls}`}>
        <button className="lg:hidden text-lg" onClick={() => setMobileNav(true)} aria-label="Menu">☰</button>
        <span className="text-base leading-none">{st.icon}</span>
        <span className="text-sm font-medium flex-1 truncate">
          {status?.message || "Genie is ready."}
        </span>
        {status?.actionable && (
          <button onClick={status.onAct} className="text-sm font-semibold underline whitespace-nowrap">
            View
          </button>
        )}
      </div>

      {/* Three zones */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Rail
          active={nav}
          businesses={businesses}
          activeHost={activeHost}
          onSelectBusiness={onSelectBusiness}
          mobileOpen={mobileNav}
          onCloseMobile={() => setMobileNav(false)}
        />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-6 md:px-10 xl:px-12 py-8">{children}</div>
        </main>

        <GeniePanel
          host={genie.host || activeHost}
          contextChips={genie.contextChips || []}
          quickActions={genie.quickActions || []}
          suggestionCount={genie.suggestionCount || 0}
        />
      </div>

      {/* Mobile Genie floating button */}
      <MobileGenieButton suggestionCount={genie.suggestionCount || 0} host={genie.host || activeHost} />
    </div>
  );
}

function MobileGenieButton({ suggestionCount, host }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="xl:hidden fixed right-4 bottom-5 z-30 flex items-center gap-2 bg-surface border border-ink-900/[0.06] shadow-glow rounded-full pl-2 pr-4 py-2"
      >
        <AwareOrb state={suggestionCount > 0 ? "suggesting" : "idle"} count={suggestionCount} size={26} />
        <span className="text-sm font-medium text-ink-900">
          {suggestionCount > 0 ? `${suggestionCount}` : "Genie"}
        </span>
      </button>
      {open && (
        <div className="xl:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 top-14 bg-surface rounded-t-3xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-ink-900/[0.06] flex items-center gap-2">
              <AwareOrb state="idle" size={28} />
              <span className="font-bold text-ink-900 flex-1">Genie</span>
              <button onClick={() => setOpen(false)} className="text-ink-400">✕</button>
            </div>
            <div className="flex-1">
              <GeniePanelMobileNote host={host} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GeniePanelMobileNote({ host }) {
  return (
    <div className="p-5 text-sm text-ink-600">
      Genie is watching <span className="font-medium text-ink-900">{host || "your business"}</span>.
      The full mobile chat surface arrives with the panel wiring step — for now, use Genie on desktop
      or the Ask Genie page.
      <a href="/chat" className="block mt-3 text-brand-violet font-medium">Open Ask Genie →</a>
    </div>
  );
}
