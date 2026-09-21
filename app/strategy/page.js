"use client";

// ── THE PLAN ──
// What Genie concluded about this business, in one place, in plain words — and
// editable. Everything Genie writes, hunts, pitches and emails is executed
// against this, so it is the one screen where a wrong assumption can be caught
// before it spreads through eight engines.
//
// It exists because the opposite used to be true: the owner's interview was
// pasted into fourteen prompts that each decided for themselves what the
// business was, and there was nowhere to look to find out what Genie thought,
// let alone correct it.

import { useCallback, useEffect, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { LoadingState } from "@/components/ui/v2/DataState";

// Each field, how to ask for it, and why it matters — because "angle" means
// nothing on its own, and a wrong one is the most expensive mistake here.
const FIELDS = [
  { key: "who", kind: "list", label: "Who you sell to",
    help: "In the words they would use about themselves. “furniture retailer”, not “SMB decision-maker”.",
    ph: "furniture retailer" },
  { key: "theirGoal", kind: "list", label: "What they are trying to do",
    help: "Their goal in their own business — not what you sell. This is what Genie searches for and writes about.",
    ph: "increase sales" },
  { key: "angle", kind: "text", label: "How you show up",
    help: "One of the ways they reach that goal. Almost nobody is searching for your product by name, so Genie appears where they are already looking.",
    ph: "One of the ways furniture retailers are increasing online sales" },
  { key: "mechanism", kind: "area", label: "Why it works",
    help: "The chain a buyer can follow: what their customer experiences, then what that does for their numbers. Every article, reply and pitch has to make this argument.",
    ph: "Shoppers see the sofa in their own room, so they know it fits and stop hesitating — more orders go through and fewer come back" },
  { key: "whereTheyLook", kind: "list", label: "Where they already look",
    help: "The searches and places that customer uses today. Genie hunts here.",
    ph: "how to increase furniture store sales" },
  { key: "contentThemes", kind: "list", label: "What to write about",
    help: "Angles useful to them whether or not they ever buy from you.",
    ph: "What actually causes furniture returns" },
  { key: "cta", kind: "text", label: "What you want them to do",
    help: "The one next step, and where they land.", ph: "Book a 10-minute demo" },
  { key: "proof", kind: "area", label: "Proof you can use",
    help: "Only what is genuinely true. Genie will never invent a number, and will not use one you have not given it.",
    ph: "" },
  { key: "neverSay", kind: "list", label: "Never say",
    help: "Claims and promises Genie must avoid everywhere.", ph: "" },
  { key: "notTheCustomer", kind: "list", label: "Not the customer",
    help: "Who looks like a buyer and is not. Genie uses this to reject them.", ph: "" },
  { key: "markets", kind: "list", label: "Countries worth targeting",
    help: "Leave empty unless there is a real reason.", ph: "" },
];

export default function StrategyPage() {
  const [s, setS] = useState(null);
  const [state, setState] = useState("loading");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async (refresh = false) => {
    setState("loading");
    try {
      const j = await fetch(`/api/strategy${refresh ? "?refresh=1" : ""}`, { cache: "no-store" }).then((r) => r.json());
      if (j?.needsScan) { setState("needsScan"); return; }
      if (!j?.ok || !j.strategy) { setState("error"); return; }
      setS(j.strategy); setDirty(false); setState("ready");
    } catch { setState("error"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (key, value) => { setS((p) => ({ ...p, [key]: value })); setDirty(true); setNote(""); };

  async function send(body, label) {
    setBusy(label);
    try {
      const j = await fetch("/api/strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j?.ok) { setS(j.strategy); setDirty(false); setNote(label === "confirm" ? "Confirmed. Genie will work to this." : "Saved."); }
      else setNote(j?.error || "Couldn't save that.");
    } catch { setNote("Couldn't save that."); }
    setBusy("");
  }

  const confirmed = !!s?.confirmedAt;

  return (
    <OperatorShell active="strategy">
      <OperatorHeader
        icon={Icon.target}
        label="The plan"
        title={confirmed ? "This is what Genie works to." : "Here's what I understood. Correct me."}
        kicker="Everything Genie writes, hunts, pitches and emails follows this. Change it here and all of it changes."
        action={s && (
          <span className="text-[12.5px] mg-muted flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 99, display: "inline-block", background: confirmed ? "var(--signal-live)" : "var(--signal-warn)" }} />
            {confirmed ? "Confirmed by you" : "Genie's read — not confirmed"}
          </span>
        )}
      />

      {state === "loading" && <LoadingState rows={4} />}

      {state === "needsScan" && (
        <Card className="mt-5 p-6">
          <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Genie needs to read your website first</p>
          <p className="mt-1 text-[13.5px] mg-muted" style={{ maxWidth: "var(--measure)" }}>
            The plan is built from your site and the questions Genie asked you. Run your first scan and it will draft one.
          </p>
          <a href="/today" className="mg-btn mg-btn--dawn mt-4 inline-flex" style={{ fontSize: 13.5 }}>Go to Today →</a>
        </Card>
      )}

      {state === "error" && (
        <Card className="mt-5 p-6">
          <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Couldn’t load the plan</p>
          <button onClick={() => load()} className="mg-btn mg-btn--ghost mt-3" style={{ fontSize: 13 }}>Try again</button>
        </Card>
      )}

      {state === "ready" && s && (
        <>
          {!confirmed && (
            <Card className="mt-5 p-5" style={{ borderColor: "var(--signal-warn)" }}>
              <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>Genie is working to this already</p>
              <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "var(--measure)" }}>
                It drafted this from your website{s.source === "ai" ? " and your answers" : ""}, and it is following it now — but every draft it writes says this is an unconfirmed read of your business rather than a fact about you. Fix anything wrong and confirm it, and that caveat goes away.
              </p>
            </Card>
          )}

          <div className="mt-5 flex flex-col gap-4">
            {FIELDS.map((f) => (
              <Field key={f.key} f={f} value={s[f.key]} onChange={(v) => set(f.key, v)} />
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2.5 flex-wrap">
            <button onClick={() => send({ patch: pick(s) }, "save")} disabled={!dirty || !!busy}
              className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 13.5 }}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </button>
            <button onClick={() => send({ patch: pick(s), confirm: true }, "confirm")} disabled={!!busy}
              className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 13.5 }}>
              {busy === "confirm" ? "Confirming…" : confirmed ? "Confirm again" : "This is right — work to it"}
            </button>
            <button onClick={() => load(true)} disabled={!!busy} className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 13 }}>
              Redraft from my website
            </button>
            {note && <span className="text-[12.5px]" style={{ color: "var(--accent-ink)" }}>{note}</span>}
          </div>

          <p className="mt-6 mb-2 text-[12.5px] mg-subtle" style={{ maxWidth: "var(--measure)" }}>
            Redrafting throws away your edits and reads your website again. Your answers in the setup interview are kept either way.
          </p>
        </>
      )}
    </OperatorShell>
  );
}

// Only the fields the owner edits travel back; provenance and timestamps are the
// server's business.
function pick(s) {
  const out = {};
  for (const f of FIELDS) out[f.key] = s[f.key];
  return out;
}

function Field({ f, value, onChange }) {
  const isList = f.kind === "list";
  const text = isList ? (Array.isArray(value) ? value.join("\n") : "") : (value || "");
  const onEdit = (v) => onChange(isList ? v.split("\n").map((x) => x.trim()).filter(Boolean) : v);

  return (
    <Card className="p-5">
      <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{f.label}</p>
      <p className="mt-1 text-[12.5px] mg-muted" style={{ maxWidth: "var(--measure)", lineHeight: 1.5 }}>{f.help}</p>
      {f.kind === "text" ? (
        <input value={text} onChange={(e) => onEdit(e.target.value)} placeholder={f.ph}
          className="mg-field mg-focus mt-3" style={{ width: "100%", fontSize: 13.5 }} />
      ) : (
        <textarea value={text} onChange={(e) => onEdit(e.target.value)} placeholder={f.ph}
          rows={isList ? Math.max(2, Math.min(8, text.split("\n").length + 1)) : 3}
          className="mg-field mg-focus mt-3" style={{ width: "100%", fontSize: 13.5, lineHeight: 1.55, resize: "vertical" }} />
      )}
      {isList && <p className="mt-1.5 text-[11.5px] mg-subtle">One per line.</p>}
    </Card>
  );
}
