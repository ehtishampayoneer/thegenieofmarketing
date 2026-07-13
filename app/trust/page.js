"use client";

// ── TRUST CENTER ──
// You are always in control. Genie earns autonomy per channel as it proves itself
// (review → assisted → auto); you can grant or revoke it anytime. This surface
// makes autonomy, brand protection, and compliance understandable and adjustable.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Card } from "@/components/ui/v2/primitives";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import { DataStateBadge } from "@/components/ui/v2/DataState";
import { fetchLive } from "@/lib/live";

const CHANNELS = [
  { id: "blog", label: "Blog / Articles" }, { id: "x", label: "X (Twitter)" },
  { id: "linkedin", label: "LinkedIn" }, { id: "reddit", label: "Reddit" },
  { id: "quora", label: "Quora" }, { id: "medium", label: "Medium" }, { id: "email", label: "Outreach email" },
];
const LEVELS = [
  { id: "review", label: "Review", desc: "You approve everything" },
  { id: "assisted", label: "Assisted", desc: "Genie drafts, you one-tap" },
  { id: "auto", label: "Auto", desc: "Genie acts on its own" },
];
const DEFAULT_LEVELS = Object.fromEntries(CHANNELS.map((c) => [c.id, "review"]));

export default function TrustCenterPage() {
  const [levels, setLevels] = useState(DEFAULT_LEVELS);
  const [state, setState] = useState("loading");
  const [kill, setKill] = useState(false);
  const [host, setHost] = useState(null);

  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/trust");
      if (live && data?.channels) { setLevels({ ...DEFAULT_LEVELS, ...data.channels }); setHost(data.host || null); setState("real"); }
      else setState("disconnected");
      const s = await fetchLive("/api/safety");
      if (s.live && s.data?.settings) setKill(!!s.data.settings.kill_switch);
    })();
  }, []);

  async function setLevel(channel, level) {
    setLevels((l) => ({ ...l, [channel]: level }));
    try { await fetch("/api/trust", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, channel, level }) }); } catch {}
  }
  async function toggleKill() {
    const next = !kill; setKill(next);
    try { await fetch("/api/safety", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kill_switch: next }) }); } catch {}
  }

  return (
    <OperatorShell active="trust">
      <OperatorHeader
        icon={Icon.check}
        label="Trust Center"
        provenance={<DataStateBadge state={state} />}
        title="You’re always"
        accent="in control."
      />

      {/* Kill switch */}
      <Card className="mt-5 p-5 flex items-center gap-4" style={kill ? { borderColor: "var(--signal-danger)" } : {}}>
        <span className="mg-tile" style={{ width: 40, height: 40, background: kill ? "var(--signal-danger-soft)" : "var(--surface-sunken)", color: kill ? "var(--signal-danger)" : "var(--fg-muted)" }}><Icon.bolt size={19} /></span>
        <div className="flex-1">
          <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>Emergency stop</p>
          <p className="text-[12.5px] mg-muted">{kill ? "Genie is paused — nothing will publish or send until you turn this off." : "Instantly pause all of Genie’s publishing and sending."}</p>
        </div>
        <button onClick={toggleKill} className="relative w-12 h-7 rounded-full transition shrink-0" style={{ background: kill ? "var(--signal-danger)" : "var(--border-strong)" }}>
          <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ left: kill ? 22 : 2 }} />
        </button>
      </Card>

      {/* Per-channel autonomy */}
      <div className="mt-6">
        <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Autonomy by channel</h2>
        <p className="mt-0.5 text-[12.5px] mg-muted">Start in Review. Genie earns Assisted after a few approvals, and Auto once it’s consistently winning — or grant it yourself.</p>
        <div className="mt-3 space-y-2.5">
          {CHANNELS.map((c) => (
            <Card key={c.id} className="p-4 flex items-center gap-3 flex-wrap">
              <BrandIcon brand={c.id} size={18} />
              <span className="text-[13.5px] font-semibold flex-1 min-w-[120px]" style={{ color: "var(--fg)" }}>{c.label}</span>
              <div className="flex items-center gap-0.5 p-0.5 rounded-full" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
                {LEVELS.map((lv) => (
                  <button key={lv.id} onClick={() => setLevel(c.id, lv.id)} title={lv.desc}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-full transition mg-focus"
                    style={levels[c.id] === lv.id ? { background: lv.id === "auto" ? "var(--accent)" : "var(--primary)", color: lv.id === "auto" ? "#2C1B05" : "var(--on-primary)" } : { color: "var(--fg-muted)" }}>
                    {lv.label}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* How Genie protects you */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Protect icon={Icon.check} title="Brand safety + fact-check" body="Before anything publishes, Genie checks for toxic language and unverifiable or risky claims — and blocks them, even if you approved it." />
        <Protect icon={Icon.globe} title="Platform-policy aware" body="Genie follows each platform’s norms (Reddit, X, LinkedIn, Quora) so your accounts stay safe and never look spammy." />
        <Protect icon={Icon.mail} title="Outreach compliance" body="Every email includes one-click unsubscribe and your address. Opt-outs are honored instantly and never emailed again (CAN-SPAM / GDPR)." />
      </div>

      <p className="mt-8 mb-2 text-center text-[13px] mg-subtle">Genie only acts autonomously when it’s both trusted and confident. Otherwise, it asks you first — always.</p>
    </OperatorShell>
  );
}

function Protect({ icon: IconC, title, body }) {
  return (
    <Card className="p-5">
      <span className="mg-tile" style={{ width: 36, height: 36, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><IconC size={17} /></span>
      <p className="mt-3 text-[14px] font-bold" style={{ color: "var(--fg)" }}>{title}</p>
      <p className="mt-1 text-[12.5px] mg-muted leading-snug">{body}</p>
    </Card>
  );
}
