"use client";

import { useState } from "react";

const NAV = [
  { id: "home", label: "Home", icon: "🏠", href: "/dashboard" },
  { id: "businesses", label: "Businesses", icon: "📊", expandable: true },
  { id: "actions", label: "Actions", icon: "⚡", href: "/dashboard?view=actions" },
  { id: "content", label: "Content", icon: "✍️", href: "/dashboard?view=content" },
  { id: "opportunities", label: "Opportunities", icon: "🎯", href: "/dashboard?view=opportunities" },
  { id: "integrations", label: "Integrations", icon: "🔌", href: "/dashboard?view=integrations" },
  { id: "settings", label: "Settings", icon: "⚙️", href: "/dashboard?view=settings" },
];

export default function Rail({ active = "home", businesses = [], activeHost, onSelectBusiness, mobileOpen, onCloseMobile }) {
  const [openBiz, setOpenBiz] = useState(true);

  const body = (
    <nav className="flex flex-col h-full">
      <div className="px-4 py-5 flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl grad-genie" aria-hidden />
        <span className="font-bold tracking-tight text-ink-900 hidden xl:inline">Genie</span>
      </div>

      <div className="flex-1 px-2 space-y-0.5 overflow-y-auto thin-scroll">
        {NAV.map((item) => {
          const isActive = active === item.id;
          if (item.expandable) {
            return (
              <div key={item.id}>
                <button
                  onClick={() => setOpenBiz((v) => !v)}
                  title={item.label}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                    isActive ? "bg-brand-violet/10 text-brand-violet" : "text-ink-600 hover:bg-ink-900/[0.03]"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1 text-left hidden xl:inline">{item.label}</span>
                  <span className="text-ink-400 text-xs hidden xl:inline">{openBiz ? "▾" : "▸"}</span>
                </button>
                {openBiz && (
                  <div className="ml-4 mt-0.5 space-y-0.5 hidden xl:block">
                    {businesses.length === 0 && (
                      <p className="px-3 py-1.5 text-xs text-ink-400">No sites yet</p>
                    )}
                    {businesses.map((b) => (
                      <button
                        key={b.host}
                        onClick={() => { onSelectBusiness?.(b.host); onCloseMobile?.(); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
                          b.host === activeHost ? "text-ink-900 font-medium" : "text-ink-600 hover:bg-ink-900/[0.03]"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${b.host === activeHost ? "bg-brand-violet" : "bg-ink-200"}`} />
                        <span className="truncate">{b.host}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <a
              key={item.id}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                isActive ? "bg-brand-violet/10 text-brand-violet" : "text-ink-600 hover:bg-ink-900/[0.03]"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="hidden xl:inline">{item.label}</span>
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
