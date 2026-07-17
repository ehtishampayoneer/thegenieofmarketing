"use client";

// ── SETTINGS — your business & sender ──
// Where you tell Genie who you are: business details (baked into content) and the
// email replies should reach. Reads/writes /api/profile. One clean V2 surface —
// replaces the old V1 settings/setup screens.

import { useEffect, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { createClient } from "@/lib/supabase/client";

const FIELD = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" };

export default function SettingsPage() {
  const [f, setF] = useState({ company_name: "", company_pitch: "", company_website: "", company_phone: "", company_address: "", sender_name: "", sender_email: "", logo_url: "" });
  const [state, setState] = useState("loading"); // loading | ready | disconnected
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/profile", { cache: "no-store" }).then((x) => x.json());
        if (r.ok) { setF((p) => ({ ...p, ...clean(r.profile) })); setState("ready"); }
        else setState("disconnected");
      } catch { setState("disconnected"); }
    })();
  }, []);

  const upd = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setSaved(false); };

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, setup_completed: true }) }).then((x) => x.json());
      setSaved(!!r.ok);
    } catch {}
    setSaving(false);
  }

  async function signOut() {
    try { await createClient().auth.signOut(); } catch {}
    window.location.href = "/login";
  }

  const [resetting, setResetting] = useState(false);
  async function startOver() {
    if (!window.confirm("Start over? This permanently deletes ALL data for this project — every connected account (Google, X, WordPress), all scans, keywords, content, outreach, and everything Genie has learned. Your login stays. This cannot be undone.")) return;
    setResetting(true);
    try {
      const r = await fetch("/api/diagnostics/reset", { method: "POST" }).then((x) => x.json());
      if (r.ok) { window.location.href = "/welcome"; return; }
    } catch {}
    setResetting(false);
    alert("Reset failed. Try again in a moment.");
  }

  return (
    <OperatorShell active="settings">
      <OperatorHeader
        icon={Icon.connect}
        label="Settings"
        title="Your business,"
        accent="in your words."
      />

      {state === "disconnected" ? (
        <Card className="mt-6 p-10 text-center"><p className="text-[15px] mg-muted">Sign in to edit your settings.</p></Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* About your business */}
          <Card className="p-5">
            <h2 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>About your business</h2>
            <p className="text-[12.5px] mg-muted mt-0.5">Genie bakes this into everything it writes. Correct anything it got wrong.</p>
            <div className="mt-4 flex flex-col gap-3">
              <Field label="Business name" value={f.company_name} onChange={upd("company_name")} placeholder="HOLOS" />
              <Field label="What you sell (one line)" value={f.company_pitch} onChange={upd("company_pitch")} placeholder="An AR commerce marketplace for immersive product experiences" textarea />
              <Field label="Website" value={f.company_website} onChange={upd("company_website")} placeholder="holos.com" />
              <Field label="Phone (optional)" value={f.company_phone} onChange={upd("company_phone")} placeholder="+1 …" />
              <div>
                <Field label="Logo URL (shown at the top of your emails)" value={f.logo_url} onChange={upd("logo_url")} placeholder="https://yoursite.com/logo.png" />
                {f.logo_url ? <img src={f.logo_url} alt="logo preview" style={{ maxHeight: 36, marginTop: 8, borderRadius: 6 }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
              </div>
            </div>
          </Card>

          {/* Sending identity */}
          <Card className="p-5">
            <h2 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Your sending identity</h2>
            <p className="text-[12.5px] mg-muted mt-0.5">Who your outreach comes from, and where replies go.</p>
            <div className="mt-4 flex flex-col gap-3">
              <Field label="Your name / signature" value={f.sender_name} onChange={upd("sender_name")} placeholder="Asim from HOLOS" />
              <Field label="Your email (replies come here)" value={f.sender_email} onChange={upd("sender_email")} placeholder="you@yourbusiness.com" type="email" />
              <Field label="Mailing address (required by anti-spam law)" value={f.company_address} onChange={upd("company_address")} placeholder="123 Main St, City, Country" textarea />
            </div>
            <div className="mt-4 mg-surface-quiet p-3.5">
              <p className="text-[12px]" style={{ color: "var(--fg-muted)", lineHeight: 1.5 }}>
                <b style={{ color: "var(--fg)" }}>How sending works today:</b> Genie sends from a verified, spam-safe address on your behalf, and every reply lands in <b style={{ color: "var(--fg)" }}>{f.sender_email || "your email"}</b>. To send from your <i>own</i> address (e.g. you@yourbusiness.com) with best deliverability, connect Gmail or verify your domain — coming from the Connections page.
              </p>
            </div>
          </Card>

          <div className="lg:col-span-2 flex items-center gap-3">
            <button onClick={save} disabled={saving} className="mg-btn mg-btn--dawn" style={{ fontSize: 13.5 }}>{saving ? "Saving…" : "Save settings"}</button>
            {saved && <span className="mg-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg> Saved</span>}
            <button onClick={signOut} className="mg-btn mg-btn--ghost ml-auto" style={{ fontSize: 13 }}>Sign out</button>
          </div>

          {/* Danger zone — start this project completely over */}
          <Card className="lg:col-span-2 p-5" style={{ borderColor: "var(--signal-danger-soft)" }}>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--signal-danger)" }}>Start over</h2>
            <p className="text-[12.5px] mg-muted mt-0.5" style={{ maxWidth: 560 }}>
              Make this project brand-new: permanently delete every connected account (Google, X, WordPress), all scans, keywords, content, outreach, and everything Genie has learned. Your login stays; you’ll go straight to a fresh first scan.
            </p>
            <button onClick={startOver} disabled={resetting} className="mg-btn mg-btn--ghost mt-3" style={{ fontSize: 13, color: "var(--signal-danger)", borderColor: "var(--signal-danger-soft)" }}>
              {resetting ? "Wiping everything…" : "Delete everything & start over"}
            </button>
          </Card>
        </div>
      )}
    </OperatorShell>
  );
}

function Field({ label, value, onChange, placeholder, textarea, type = "text" }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium mg-muted">{label}</span>
      {textarea ? (
        <textarea value={value || ""} onChange={onChange} placeholder={placeholder} rows={2} className="px-3 py-2 rounded-lg text-[13.5px] mg-focus resize-none" style={FIELD} />
      ) : (
        <input type={type} value={value || ""} onChange={onChange} placeholder={placeholder} className="px-3 py-2 rounded-lg text-[13.5px] mg-focus" style={FIELD} />
      )}
    </label>
  );
}

function clean(p) {
  const out = {};
  for (const k of ["company_name", "company_pitch", "company_website", "company_phone", "company_address", "sender_name", "sender_email", "logo_url"]) out[k] = p?.[k] || "";
  return out;
}
