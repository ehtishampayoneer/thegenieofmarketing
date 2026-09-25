"use client";
// app/announce/page.js
// ── SEND AN UPDATE ──
// Genie writes first-contact pitches and follow-ups, and nothing else. So an owner
// with something to say — a new product, a price change, a December offer, "we ship
// to the UAE now" — had no way to say it. They know their stock, their seasons and
// their margins; Genie does not and should not pretend to. This screen is the
// handover: the owner's words, Genie's sending discipline.
//
// It goes only to people this business has already been in contact with, through
// the same sender, the same daily allowance, the same opt-out list and the same
// unsubscribe link as everything else.

import { useEffect, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card, Button } from "@/components/ui/v2/primitives";

export default function AnnouncePage() {
  const [d, setD] = useState(null);
  const [audience, setAudience] = useState("replied");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    try {
      const j = await fetch("/api/announce").then((r) => r.json());
      if (j?.ok) setD(j);
    } catch {}
  }
  useEffect(() => { load(); }, []);

  const chosen = d?.audiences?.find((a) => a.key === audience) || null;
  const ready = subject.trim().length >= 3 && body.trim().length >= 40 && (chosen?.count || 0) > 0;

  async function send() {
    setBusy(true); setResult(null);
    try {
      const j = await fetch("/api/announce", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, subject, body }),
      }).then((r) => r.json());
      setResult(j);
      if (j?.ok) { setSubject(""); setBody(""); load(); }
    } catch {
      setResult({ ok: false, error: "That did not send. Try again in a moment." });
    }
    setBusy(false); setConfirming(false);
  }

  return (
    <OperatorShell active="announce">
      <OperatorHeader
        icon={Icon.mail}
        label="Send an update"
        title="Your words,"
        accent="sent properly."
        kicker="Genie writes the cold emails. This is for the things only you know: a new product, a price change, an offer, a season. It goes to people you have already been in touch with."
      />

      {/* WHO */}
      <Card className="p-4 mt-4">
        <p className="mg-eyebrow">Who it goes to</p>
        <div className="mt-3 flex flex-col gap-2">
          {(d?.audiences || []).map((a) => (
            <label key={a.key} className="flex items-start gap-3 p-3 rounded-xl cursor-pointer"
              style={{ border: `1px solid ${audience === a.key ? "var(--accent-ink)" : "var(--hair)"}`, background: audience === a.key ? "var(--surface-2)" : "transparent" }}>
              <input
                type="radio" name="announce-audience" id={`aud-${a.key}`} value={a.key}
                checked={audience === a.key} onChange={() => setAudience(a.key)}
                className="mt-1" style={{ accentColor: "var(--accent-ink)" }}
              />
              <span className="min-w-0">
                <span className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>
                  {a.label} <span className="mg-subtle">· {a.count}</span>
                </span>
                <span className="block text-[12.5px] mt-0.5 mg-muted">{a.why}</span>
                <span className="block text-[12.5px] mt-1 mg-subtle">{a.note}</span>
              </span>
            </label>
          ))}
          {!d && <p className="text-[13px] mg-subtle">Counting who you can reach…</p>}
        </div>
      </Card>

      {/* WHAT */}
      <Card className="p-4 mt-4">
        <p className="mg-eyebrow">What you want to say</p>
        <label htmlFor="announce-subject" className="block mt-3 text-[12.5px] mg-muted">Subject line — the only part most people read</label>
        <input
          id="announce-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="We now ship to the UAE"
          className="w-full mt-1 p-2.5 rounded-lg text-[14px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--fg)" }}
        />
        <label htmlFor="announce-body" className="block mt-3 text-[12.5px] mg-muted">The message. Genie adds their name at the top and your unsubscribe link at the bottom.</label>
        <textarea
          id="announce-body" value={body} onChange={(e) => setBody(e.target.value)} rows={9}
          placeholder={"Write it the way you would say it.\n\nShort is better than polished. People answer a person, not a newsletter."}
          className="w-full mt-1 p-3 rounded-lg text-[14px] leading-relaxed"
          style={{ background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--fg)" }}
        />
        <p className="mt-2 text-[12px] mg-subtle">
          Sends from your own Gmail, one at a time, spaced out. Anyone who opted out or bounced is left out automatically.
        </p>
      </Card>

      {/* SEND — two steps, because this one cannot be taken back */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!confirming ? (
          <Button variant="dawn" disabled={!ready || busy} onClick={() => setConfirming(true)}>
            Send to {chosen?.count || 0} {chosen?.count === 1 ? "person" : "people"} →
          </Button>
        ) : (
          <>
            <Button variant="dawn" disabled={busy} onClick={send}>
              {busy ? "Sending…" : `Yes, send it now`}
            </Button>
            <button className="text-[13px] font-semibold" style={{ color: "var(--fg-muted)" }} onClick={() => setConfirming(false)}>
              Not yet
            </button>
            <span className="text-[12.5px] mg-subtle">
              This goes out immediately from {`${"your own Gmail"}`}. An email cannot be recalled.
            </span>
          </>
        )}
        {!ready && !busy && (
          <span className="text-[12.5px] mg-subtle">
            {(chosen?.count || 0) === 0 ? "Nobody in that list yet." : "Add a subject and a few lines first."}
          </span>
        )}
      </div>

      {result && (
        <Card className="p-4 mt-4" style={result.ok ? undefined : { borderColor: "var(--signal-danger)" }}>
          <p className="text-[14px]" style={{ color: "var(--fg)" }}>
            {result.ok ? result.message : result.error}
          </p>
          {result.ok && (
            <p className="mt-1 text-[12.5px] mg-subtle">
              Every one of them is on Everything Genie did, and you can read exactly what was sent.
            </p>
          )}
        </Card>
      )}
    </OperatorShell>
  );
}
