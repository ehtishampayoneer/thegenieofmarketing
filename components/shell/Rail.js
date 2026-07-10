"use client";

import { Logo, LogoMark } from "@/components/ui/Logo";
import Icon from "@/components/ui/Icon";

// Clean operator rail — MG logo, professional line icons, ink/paper.
const NAV = [
  { id: "home", label: "Home", icon: Icon.home, href: "/dashboard" },
  { id: "tasks", label: "Today's taps", icon: Icon.tasks, href: "/tasks", badge: true },
  { id: "stories", label: "Conversations", icon: Icon.conversations, href: "/stories" },
  { id: "growth", label: "Growth", icon: Icon.growth, href: "/growth" },
  { id: "research", label: "Keyword Research", icon: Icon.search, href: "/research" },
  { id: "notifications", label: "Inbox", icon: Icon.inbox, href: "/notifications" },
  { id: "history", label: "History", icon: Icon.history, href: "/dashboard?view=history" },
  { id: "connect", label: "Connect", icon: Icon.connect, href: "/dashboard?view=integrations" },
  { id: "settings", label: "Settings", icon: Icon.settings, href: "/dashboard?view=settings" },
];

export default function Rail({ active = "home", taskCount = 0, businessName, mobileOpen, onCloseMobile }) {
  const body = (
    <nav className="flex flex-col h-full bg-panel">
      <div className="px-4 py-4 flex items-center gap-2.5 border-b border-hairline">
        <LogoMark size={40} />
        <span className="font-bold tracking-tight text-ink hidden xl:inline text-[15px]">Marketing Genie</span>
      </div>

      <div className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto thin-scroll">
        {NAV.map((item) => {
          const isActive = active === item.id;
          const IconC = item.icon;
          return (
            <a
              key={item.id}
              href={item.href}
              title={item.label}
              onClick={() => onCloseMobile?.()}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive ? "bg-ink text-paper shadow-sm" : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              <IconC size={19} />
              <span className="hidden xl:inline">{item.label}</span>
              {item.badge && taskCount > 0 && (
                <span className={`ml-auto text-[11px] font-bold rounded-full px-1.5 min-w-[20px] text-center ${isActive ? "bg-paper/20 text-paper" : "bg-accent text-white"}`}>
                  {taskCount}
                </span>
              )}
            </a>
          );
        })}
      </div>

      {businessName && (
        <div className="px-4 py-3 border-t border-hairline hidden xl:block">
          <p className="text-[11px] text-ink-400">Watching</p>
          <p className="text-xs font-medium text-ink truncate">{businessName}</p>
        </div>
      )}
    </nav>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden md:flex md:w-[68px] xl:w-[248px] shrink-0 border-r border-hairline h-full transition-all">
        {body}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/40 animate-fade" onClick={onCloseMobile} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-panel shadow-lg animate-scale-in">{body}</div>
        </div>
      )}
    </>
  );
}
