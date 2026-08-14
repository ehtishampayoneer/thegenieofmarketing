"use client";

// The end-of-article opt-in on a published Genie Page — turns one-and-done reader
// traffic into an owned list. Posts to /api/subscribe; the owner is resolved
// server-side from the page, so the reader only ever sends their email.

import { useState } from "react";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SubscribeBox({ handle, slug, business, topic }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | loading | done | error

  async function submit(e) {
    e.preventDefault();
    if (state === "loading" || state === "done") return;
    if (!EMAIL.test(email)) { setState("error"); return; }
    setState("loading");
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, handle, slug, source: "article" }),
      }).then((x) => x.json());
      setState(r?.ok ? "done" : "error");
    } catch { setState("error"); }
  }

  if (state === "done") {
    return (
      <div className="gp-sub gp-sub--done">
        <p className="gp-sub-k">You’re in</p>
        <p className="gp-sub-t">Thanks for subscribing.</p>
        <p className="gp-sub-s">We’ll send the good stuff to {email}.</p>
      </div>
    );
  }

  return (
    <form className="gp-sub" onSubmit={submit}>
      <p className="gp-sub-k">{business ? `From ${business}` : "Stay in the loop"}</p>
      <p className="gp-sub-t">Get more like this{topic ? ` on ${topic}` : ""}.</p>
      <p className="gp-sub-s">Practical tips straight to your inbox. No spam, unsubscribe anytime.</p>
      <div className="gp-sub-row">
        <input
          type="email" required placeholder="you@email.com" value={email} aria-label="Email address"
          onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          className="gp-sub-in"
        />
        <button type="submit" className="gp-sub-b" disabled={state === "loading"}>{state === "loading" ? "Joining…" : "Join free"}</button>
      </div>
      {state === "error" && <p className="gp-sub-err">Please enter a valid email and try again.</p>}
    </form>
  );
}
