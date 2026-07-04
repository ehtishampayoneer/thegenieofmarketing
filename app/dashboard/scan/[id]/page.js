"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeAccuracy } from "@/lib/accuracy";
import { hostOf } from "@/lib/business";
import { Report } from "@/components/report";
import AppShell from "@/components/shell/AppShell";

export default function ScanDetail({ params }) {
  const router = useRouter();
  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [data, setData] = useState(null);
  const [actionCount, setActionCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      try {
        const res = await fetch(`/api/scans/${params.id}`);
        const j = await res.json();
        if (!active) return;
        if (!j.ok || !j.scan) { setState("notfound"); return; }
        const s = j.scan;
        setData({
          scores: s.scores || {},
          checks: s.checks || [],
          finalUrl: s.final_url || s.url,
          speed: s.speed || null,
          speedAvailable: !!s.speed,
          gsc: s.gsc || null,
          accuracy: computeAccuracy({ speedAvailable: !!s.speed, gscVerified: !!s.gsc }),
          ai: s.ai || null,
        });
        setState("ready");
      } catch {
        if (active) setState("notfound");
      }
      // pending actions for the status strip / orb
      try {
        const aRes = await fetch("/api/actions?status=proposed");
        const aJson = await aRes.json();
        if (active && aJson.ok) setActionCount((aJson.actions || []).length);
      } catch {}
    })();
    return () => { active = false; };
  }, [params.id, router]);

  const host = data ? hostOf(data.finalUrl) : "";
  const businessName = data?.ai?.businessName || host;

  const status = actionCount > 0
    ? { state: "pending_approval", message: `${actionCount} item${actionCount > 1 ? "s" : ""} waiting for your approval.`, actionable: false }
    : { state: "idle", message: `Viewing your ${businessName} command center.`, actionable: false };

  const genie = {
    host,
    suggestionCount: actionCount,
    contextChips: [
      { label: businessName, active: true },
      { label: "This scan", active: true },
    ],
    quickActions: [
      { label: "What should I fix first?", prompt: `Looking at ${businessName}, what should I fix first and why?` },
      { label: "Summarize this scan", prompt: `Summarize this scan of ${businessName} in a few bullets.` },
      { label: "Why is my score low?", prompt: `Why is ${businessName}'s score what it is, and the fastest way to raise it?` },
    ],
  };

  return (
    <AppShell nav="businesses" businesses={host ? [{ host }] : []} activeHost={host} status={status} genie={genie}>
      {state === "loading" && <p className="text-ink-400">Loading report…</p>}
      {state === "notfound" && (
        <div className="text-center py-10">
          <p className="text-ink-600">That report couldn't be found.</p>
          <a href="/dashboard" className="mt-3 inline-block text-brand-violet font-medium hover:underline">← Back to dashboard</a>
        </div>
      )}
      {state === "ready" && data && (
        <Report data={data} loggedIn={true} saved={false} comparison={null} scanId={params.id} />
      )}
    </AppShell>
  );
}
