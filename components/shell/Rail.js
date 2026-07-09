"use client";

import { useState } from "react";

// New operator-model rail (per the UX pivot constitution). Six clean items.
const NAV = [
  { id: "home", label: "Dashboard", icon: "🏠", href: "/dashboard" },
  { id: "tasks", label: "Tasks", icon: "✅", href: "/tasks", badge: true },
  { id: "growth", label: "Growth", icon: "📈", href: "/growth" },
  { id: "notifications", label: "Inbox", icon: "📬", href: "/notifications" },
  { id: "history", label: "History", icon: "🕐", href: "/dashboard?view=history" },
  { id: "connect", label: "Connect", icon: "🔌", href: "/dashboard?view=integrations" },
  { id: "settings", label: "Settings", icon: "⚙️", href: "/dashboard?view=settings" },
];

export default function Rail({ active = "home", taskCount = 0, businessName, mobileOpen, onCloseMobile }) {
  const body = (
    <nav className="flex flex-col h-full">
      <div className="px-4 py-5 flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl grad-genie" aria-hidden />
        <span className="font-bold tracking-tight text-ink-900 hidden xl:inline">Genie</span>
      </div>

      <div className="flex-1 px-2 space-y-0.5 overflow-y-auto thin-scroll">
        {NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <a
              key={item.id}
              href={item.href}
              title={item.label}
              onClick={() => onCloseMobile?.()}
              className={`relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                isActive ? "bg-brand-violet/10 text-brand-violet" : "text-ink-600 hover:bg-ink-900/[0.03]"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="hidden xl:inline">{item.label}</span>
              {item.badge && taskCount > 0 && (
                <span className="ml-auto text-[10px] font-bold text-white bg-brand-violet rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {taskCount > 99 ? "99+" : taskCount}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden md:flex md:w-[64px] xl:w-[240px] shrink-0 bg-rail border-r border-ink-900/[0.06] overflow-hidden">
        {body}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink-900/30" onClick={onCloseMobile} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-rail shadow-lg">
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
