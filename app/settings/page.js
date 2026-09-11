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
import { fetchLive } from "@/lib/live";
import { LogoUpload } from "@/components/ui/v2/LogoUpload";
import { createClient } from "@/lib/supabase/client";

const FIELD = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" };

export default function SettingsPage() {
  const [f, setF] = useState({ company_name: "", company_pitch: "", company_website: "", company_phone: "", company_address: "", sender_name: "", sender_email: "", logo_url: "", money_page_url: "" });
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
      if (r.ok) {
        // Wipe Genie-only browser storage too (theme, dismissed banners) so the
        // front end is as brand-new as the backend. Nothing outside the app.
        try {
          [localStorage, sessionStorage].forEach((store) => {
            Object.keys(store).filter((k) => k.startsWith("mg-")).forEach((k) => store.removeItem(k));
          });
        } catch {}
        window.location.href = "/welcome";
        return;
      }
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
            <p className="text-[13px] mg-muted mt-0.5">Genie bakes this into everything it writes. Correct anything it got wrong.</p>
            <div className="mt-4 flex flex-col gap-3">
              <Field label="Business name" value={f.company_name} onChange={upd("company_name")} placeholder="HOLOS" />
              <Field label="What you sell (one line)" value={f.company_pitch} onChange={upd("company_pitch")} placeholder="An AR commerce marketplace for immersive product experiences" textarea />
              <Field label="Website" value={f.company_website} onChange={upd("company_website")} placeholder="holos.com" />
              <Field
                label="Where buyers should go to buy"
                value={f.money_page_url}
                onChange={upd("money_page_url")}
                placeholder="yoursite.com/pricing"
                hint="Your pricing page, packages page, checkout or contact form. Genie sends every buyer here and never handles the payment itself."
              />
              <Field label="Phone (optional)" value={f.company_phone} onChange={upd("company_phone")} placeholder="+1 …" />
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium mg-muted">Logo (shown at the top of your emails)</span>
                <LogoUpload value={f.logo_url} onChange={(url) => { setF((p) => ({ ...p, logo_url: url })); setSaved(false); }} />
              </div>
            </div>
          </Card>

          {/* Sending identity */}
          <Card className="p-5">
            <h2 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Your sending identity</h2>
            <p className="text-[13px] mg-muted mt-0.5">Who your outreach comes from, and where replies go.</p>
            <div className="mt-4 flex flex-col gap-3">
              <Field label="Your name / signature" value={f.sender_name} onChange={upd("sender_name")} placeholder="Asim from HOLOS" />
              <Field label="Your email (replies come here)" value={f.sender_email} onChange={upd("sender_email")} placeholder="you@yourbusiness.com" type="email" />
              <Field label="Mailing address (required by anti-spam law)" value={f.company_address} onChange={upd("company_address")} placeholder="123 Main St, City, Country" textarea />
            </div>
            <div className="mt-4 mg-surface-quiet p-3.5">
              <p className="text-[12px]" style={{ color: "var(--fg-muted)", lineHeight: 1.5 }}>
                <b style={{ color: "var(--fg)" }}>How sending works:</b> outreach goes out through your <i>own</i> connected Gmail, so it arrives with your reputation behind it and replies land where you already read email. You cannot simply type an address here and have Genie send as you: mail providers check that the sender really is who it claims to be, and a message failing that check goes to spam. So if no mailbox is connected, Genie <b style={{ color: "var(--fg)" }}>declines to send</b> rather than burning the contact on an email nobody will see. Connect Gmail on the Connections page.
              </p>
            </div>
          </Card>

          <div className="lg:col-span-2 flex items-center gap-3">
            <button onClick={save} disabled={saving} className="mg-btn mg-btn--dawn" style={{ fontSize: 14 }}>{saving ? "Saving…" : "Save settings"}</button>
            {saved && <span className="mg-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg> Saved</span>}
            <button onClick={signOut} className="mg-btn mg-btn--ghost ml-auto" style={{ fontSize: 13 }}>Sign out</button>
          </div>

          {/* The one snippet: traffic + lead capture on the owner's own site */}
          <InstallSnippet />

          {/* First-party facts — the real Information Gain input */}
          <FirstPartyFacts />

          {/* Danger zone — start this project completely over */}
          <Card className="lg:col-span-2 p-5" style={{ borderColor: "var(--signal-danger-soft)" }}>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--signal-danger)" }}>Start over</h2>
            <p className="text-[13px] mg-muted mt-0.5" style={{ maxWidth: 560 }}>
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

// First-party facts: the real, non-Googleable details that make Genie's content
// genuinely original (Information Gain) instead of just "not obviously AI". Saved to
// /api/expertise; the content engine weaves them into every article.
const FP_FIELDS = [
  { k: "data", label: "Your own data & numbers", ph: "Real stats only you know — e.g. \"we've installed 400+ units\", \"jobs average 3 days\", \"clients save ~20%\"." },
  { k: "process", label: "Your signature process / method", ph: "The specific steps or approach you follow that competitors don't — name them." },
  { k: "proof", label: "Proof / a real mini case study", ph: "A concrete result — e.g. \"a café in Austin went from 200 to 1,400 monthly orders in 6 weeks after…\"." },
  { k: "take", label: "Your expert / contrarian take", ph: "A belief you hold that corrects a common myth in your field — the kind of thing only an insider says." },
];
function FirstPartyFacts() {
  const [f, setF] = useState({ data: "", process: "", proof: "", take: "" });
  const [state, setState] = useState("loading");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    (async () => {
      try { const r = await fetch("/api/expertise", { cache: "no-store" }).then((x) => x.json()); if (r?.ok) setF((p) => ({ ...p, ...(r.facts || {}) })); } catch {}
      setState("ready");
    })();
  }, []);
  const upd = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setSaved(false); };
  async function save() {
    setSaving(true);
    try { const r = await fetch("/api/expertise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facts: f }) }).then((x) => x.json()); setSaved(!!r?.ok); } catch {}
    setSaving(false);
  }
  const filled = FP_FIELDS.filter((x) => (f[x.k] || "").trim()).length;
  return (
    <Card className="lg:col-span-2 p-5" style={{ borderColor: "var(--accent)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Icon.spark size={16} style={{ color: "var(--accent-ink)" }} />
        <h2 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Make your content genuinely original</h2>
        <span className="text-[11px] mg-subtle mg-num">{filled}/4</span>
      </div>
      <p className="text-[13px] mg-muted mt-0.5" style={{ maxWidth: 620 }}>
        Google now buries generic AI content and rewards <b style={{ color: "var(--fg)" }}>real, first-hand value</b>. These are the things an AI can't invent — your data, your process, your proof, your expert opinion. Give Genie even one or two, and every article it writes gets markedly more citable. Optional, but this is the single biggest quality lever you control.
      </p>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {FP_FIELDS.map((x) => (
          <label key={x.k} className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium mg-muted">{x.label}</span>
            <textarea value={f[x.k] || ""} onChange={upd(x.k)} placeholder={x.ph} rows={3} className="px-3 py-2 rounded-lg text-[13px] mg-focus resize-none" style={FIELD} />
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saving || state !== "ready"} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 13 }}>{saving ? "Saving…" : "Save my facts"}</button>
        {saved && <span className="mg-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg> Saved · Genie will use these</span>}
      </div>
    </Card>
  );
}

// ── THE ONE SNIPPET ──────────────────────────────────────────────────────────
// One line the owner pastes into their own site, once. It counts real visits
// (so the traffic panel works with no Google connection), catches visitors who
// were not ready to buy, and points people at the money page. The token is the
// same signed ingest key the conversion pixel and commerce webhooks already use,
// so there is nothing new to configure.
function InstallSnippet() {
  const [info, setInfo] = useState(null);      // platform, tag, plugin
  const [traffic, setTraffic] = useState(null);
  const [copied, setCopied] = useState(false);
  const [devEmail, setDevEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const [showDev, setShowDev] = useState(false);

  useEffect(() => {
    (async () => {
      const i = await fetchLive("/api/install");
      if (i.live && i.data?.ok) setInfo(i.data);
      const t = await fetchLive(`/api/traffic?tz=${new Date().getTimezoneOffset()}`);
      if (t.live && t.data) setTraffic(t.data);
    })();
  }, []);

  async function copy() {
    if (!info?.tag) return;
    try { await navigator.clipboard.writeText(info.tag); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  async function sendToDev() {
    const to = devEmail.trim();
    if (!to || sending) return;
    setSending(true); setSent("");
    try {
      const j = await fetch("/api/install", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      }).then((r) => r.json());
      setSent(j?.ok
        ? `Sent to ${j.sentTo}. They have everything they need.`
        : (j?.error || "Could not send that just now."));
      if (j?.ok) setDevEmail("");
    } catch { setSent("Could not send that just now."); }
    setSending(false);
  }

  const installed = traffic?.installed;
  const platform = info?.platform;

  return (
    <Card className="lg:col-span-2 p-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Turn on visitor tracking</h2>
        {installed
          ? <span className="mg-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg> Installed and counting</span>
          : <span className="mg-pill">Not installed yet</span>}
      </div>
      <p className="text-[13px] mg-muted mt-1" style={{ maxWidth: "var(--measure)" }}>
        One line on your own website lets Genie count your visitors, catch the ones who are not ready to buy, and send the rest to your buy page. It is the same kind of tag as Google Analytics: it loads last so it cannot slow your site, sets no cookies, and collects nothing unless someone types their email in.
      </p>

      {/* the line itself */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <code style={{ ...CODE, flex: 1, minWidth: 260, padding: "10px 12px", borderRadius: 10, display: "block", overflowX: "auto", whiteSpace: "nowrap" }}>
          {info?.tag || "Loading your line…"}
        </code>
        <button onClick={copy} disabled={!info?.tag} className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 13 }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* where it goes, named for THEIR platform */}
      {platform && (
        <div className="mt-4 p-3.5 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
            {platform.id === "generic"
              ? "Where it goes"
              : `Where it goes on ${platform.name}`}
          </p>
          <ol className="mt-1.5 flex flex-col gap-1" style={{ margin: 0, paddingLeft: 18 }}>
            {platform.steps.map((st, i) => (
              <li key={i} className="text-[12.5px] mg-muted" style={{ lineHeight: 1.5 }}>{st}</li>
            ))}
          </ol>

          {info?.plugin && (
            <a href={info.plugin} className="mg-btn mg-btn--dawn mt-3 inline-flex" style={{ fontSize: 13 }}>
              Download the plugin
            </a>
          )}
        </div>
      )}

      {/* hand it to whoever looks after the site */}
      <div className="mt-3">
        {!showDev ? (
          <button onClick={() => setShowDev(true)} className="mg-focus" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--accent-ink)", fontSize: 13, fontWeight: 600 }}>
            Someone else manages my website →
          </button>
        ) : (
          <div className="p-3.5 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
            <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>Send it to them</p>
            <p className="text-[12.5px] mg-muted mt-0.5" style={{ maxWidth: "var(--measure)" }}>
              Genie emails them the line, the exact steps for {platform?.id === "generic" ? "your site" : platform?.name}, and what it does and does not do. It goes from your own email address, so they know it is really you.
            </p>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <input
                value={devEmail} onChange={(e) => setDevEmail(e.target.value)} type="email"
                onKeyDown={(e) => e.key === "Enter" && sendToDev()}
                placeholder="their@email.com"
                className="mg-field mg-focus" style={{ flex: 1, minWidth: 220, maxWidth: 320, fontSize: 13 }}
              />
              <button onClick={sendToDev} disabled={sending || !devEmail.trim()} className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 13 }}>
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
            {sent && <p className="mt-2 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>{sent}</p>}
          </div>
        )}
      </div>

      <p className="text-[12px] mg-subtle mt-3">
        Optional: put <code style={CODE}>data-genie=&quot;buy&quot;</code> on any button of your own and Genie will point it at your buy page with tracking attached.
      </p>
    </Card>
  );
}

const CODE = { fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: 6, padding: "1px 5px", color: "var(--fg)" };

function Field({ label, value, onChange, placeholder, textarea, type = "text", hint }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium mg-muted">{label}</span>
      {textarea ? (
        <textarea value={value || ""} onChange={onChange} placeholder={placeholder} rows={2} className="px-3 py-2 rounded-lg text-[14px] mg-focus resize-none" style={FIELD} />
      ) : (
        <input type={type} value={value || ""} onChange={onChange} placeholder={placeholder} className="px-3 py-2 rounded-lg text-[14px] mg-focus" style={FIELD} />
      )}
      {hint && <span className="text-[12px] mg-subtle leading-snug">{hint}</span>}
    </label>
  );
}

function clean(p) {
  const out = {};
  for (const k of ["company_name", "company_pitch", "company_website", "company_phone", "company_address", "sender_name", "sender_email", "logo_url", "money_page_url"]) out[k] = p?.[k] || "";
  return out;
}
