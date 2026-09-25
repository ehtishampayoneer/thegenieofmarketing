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
    help: "In the words they would use about themselves. “independent bookshop”, not “SMB decision-maker”.",
    ph: "independent bookshop" },
  { key: "theirGoal", kind: "list", label: "What they are trying to do",
    help: "Their goal in their own business — not what you sell. This is what Genie searches for and writes about.",
    ph: "increase sales" },
  { key: "angle", kind: "text", label: "How you show up",
    help: "One of the ways they reach that goal. Almost nobody is searching for your product by name, so Genie appears where they are already looking.",
    ph: "One of the ways independent bookshops are competing with the chains" },
  { key: "mechanism", kind: "area", label: "Why it works",
    help: "The chain a buyer can follow: what their customer experiences, then what that does for their numbers. Every article, reply and pitch has to make this argument.",
    ph: "Readers find the book they did not know they wanted, so they come back on a Saturday instead of ordering online" },
  { key: "offer", kind: "area", label: "What you sell, and what it costs",
    help: "Include the real price. “From $29 a month” gets replies that “affordable” never does, and a reader who has to ask what it costs usually doesn’t. I will never invent a number here.",
    ph: "AR product views on your store. Starter $29/mo plus a $249 setup, Studio $59 plus $549, Showroom $99 plus $999. Extra products $20 each." },
  { key: "partnerOffer", kind: "area", label: "What a partner or agency gets",
    help: "Different question from the price. An agency that builds twenty stores isn’t buying this, they’re putting it in front of their clients — and the first thing they ask is what’s in it for them. Leave empty if you don’t sell through partners.",
    ph: "20% of the monthly fee, for as long as the client stays. We handle the 3D models, you keep the client." },
  { key: "whereTheyLook", kind: "list", label: "Where they already look",
    help: "The searches and places that customer uses today. Genie hunts here.",
    ph: "how to get more customers into a bookshop" },
  { key: "contentThemes", kind: "list", label: "What to write about",
    help: "Angles useful to them whether or not they ever buy from you.",
    ph: "What actually brings people back to a bookshop" },
  { key: "cta", kind: "text", label: "What you want them to do",
    help: "The one next step, and where they land.", ph: "Book a 10-minute demo" },
  { key: "proof", kind: "area", label: "Proof you can use",
    help: "Only what is genuinely true. Genie will never invent a number, and will not use one you have not given it.",
    ph: "" },
  { key: "neverSay", kind: "list", label: "Never say",
    help: "Claims and promises Genie must avoid everywhere.", ph: "" },
  { key: "notTheCustomer", kind: "list", label: "Not the customer",
    help: "Who looks like a buyer and is not. Genie uses this to reject them.", ph: "" },
  { key: "roles", kind: "list", label: "Who inside the company",
    help: "The jobs this actually helps. I only write to people it is relevant to — that is what separates a welcome message from an unwelcome one, and in some countries it is what makes a cold message lawful at all.",
    ph: "ecommerce manager" },
  { key: "qualityBar", kind: "area", label: "Which companies are worth contacting",
    help: "There are thousands that match. This is how I pick the twenty a night that are worth your name on an email.",
    ph: "At least 10 reviews, three years trading, their own site is well built, and they sell more than a handful of products." },
  { key: "markets", kind: "list", label: "Countries worth targeting",
    help: "Leave empty unless there is a real reason. This is where I aim the writing.", ph: "" },
  { key: "emailCountries", kind: "list", label: "Countries I may email into",
    help: "Not the same question as above: you can publish for a country and still not be allowed to cold-email it. I start with the places where emailing a published business address is permitted with an opt-out. Canada asks for one more thing — that the message is relevant to the person's job — and I now check that on every send, so you can add Canada here if you want it. Germany wants a written assessment for each contact, which I cannot do honestly yet. I am telling you the shape of these rules, not giving legal advice.",
    ph: "United States" },
];

export default function StrategyPage() {
  const [s, setS] = useState(null);
  const [state, setState] = useState("loading");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [proposal, setProposal] = useState(null);

  const load = useCallback(async (refresh = false) => {
    setState("loading");
    try {
      const j = await fetch(`/api/strategy${refresh ? "?refresh=1" : ""}`, { cache: "no-store" }).then((r) => r.json());
      if (j?.needsScan) { setState("needsScan"); return; }
      if (!j?.ok || !j.strategy) { setState("error"); return; }
      setS(j.strategy); setProposal(j.proposal || null); setDirty(false); setState("ready");
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

  // Genie learned something that disagrees with the plan. Accepting merges it and
  // marks the plan as the owner's; dismissing means it is not asked again.
  async function answer(kind) {
    setBusy(kind);
    try {
      const j = await fetch("/api/strategy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: kind }),
      }).then((r) => r.json());
      if (j?.ok) {
        if (j.strategy) setS(j.strategy);
        setProposal(null); setDirty(false);
        setNote(kind === "accept" ? "Applied. Every part of Genie follows this from now on." : "Left as it was.");
      } else setNote(j?.error || "Couldn't do that.");
    } catch { setNote("Couldn't do that."); }
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

          {proposal && (
            <Card className="mt-5 p-5" style={{ borderColor: "var(--signal-live)" }}>
              <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>Genie learned something since you wrote this</p>
              {proposal.patch?.reason && (
                <p className="mt-1 text-[13.5px]" style={{ color: "var(--fg)", maxWidth: "var(--measure)" }}>{proposal.patch.reason}</p>
              )}
              {!!proposal.facts?.length && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {proposal.facts.map((f, i) => (
                    <li key={i} className="text-[13px] mg-muted flex gap-2" style={{ maxWidth: "var(--measure)" }}>
                      <span style={{ color: "var(--signal-live)" }}>•</span><span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-col gap-1.5">
                {Object.entries(proposal.patch || {}).filter(([k]) => k !== "reason").map(([k, v]) => {
                  const f = FIELDS.find((x) => x.key === k);
                  const added = Array.isArray(v) ? v.filter((x) => !(s[k] || []).includes(x)) : [];
                  if (!added.length) return null;
                  return (
                    <p key={k} className="text-[13px]" style={{ color: "var(--fg)" }}>
                      <span className="mg-muted">{f?.label || k}:</span> add {added.map((a) => `“${a}”`).join(", ")}
                    </p>
                  );
                })}
              </div>
              <p className="mt-3 text-[12.5px] mg-muted" style={{ maxWidth: "var(--measure)" }}>
                Nothing already in your plan is removed. Genie will not change this by itself either way.
              </p>
              <div className="mt-3 flex items-center gap-2.5 flex-wrap">
                <button onClick={() => answer("accept")} disabled={!!busy}
                  className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 13.5 }}>
                  {busy === "accept" ? "Applying…" : "Add it to the plan"}
                </button>
                <button onClick={() => answer("dismiss")} disabled={!!busy}
                  className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 13.5 }}>
                  {busy === "dismiss" ? "…" : "No, leave it"}
                </button>
              </div>
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
