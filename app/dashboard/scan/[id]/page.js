"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeAccuracy } from "@/lib/accuracy";
import { Report } from "@/components/report";

export default function ScanDetail({ params }) {
  const router = useRouter();
  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [data, setData] = useState(null);
  const [when, setWhen] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        const res = await fetch(`/api/scans/${params.id}`);
        const j = await res.json();
        if (!active) return;
        if (!j.ok || !j.scan) {
          setState("notfound");
          return;
        }
        const s = j.scan;
        // Rebuild the exact shape the Report component expects.
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
        try {
          setWhen(new Date(s.created_at).toLocaleString());
        } catch {}
        setState("ready");
      } catch {
        if (active) setState("notfound");
      }
    })();
    return () => { active = false; };
  }, [params.id, router]);

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center gap-2">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg genie-gradient" aria-hidden />
          <span className="font-bold tracking-tight text-genie-ink">Marketing Genie</span>
        </a>
        <a
          href="/dashboard"
          className="ml-auto text-sm text-genie-purple font-medium hover:underline"
        >
          ← Back to dashboard
        </a>
      </header>

      {state === "loading" && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-genie-ink/50">Loading report…</p>
        </div>
      )}

      {state === "notfound" && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <p className="text-genie-ink/70">That report couldn’t be found.</p>
            <a href="/dashboard" className="mt-3 inline-block text-genie-purple font-medium hover:underline">
              ← Back to dashboard
            </a>
          </div>
        </div>
      )}

      {state === "ready" && data && (
        <>
          {when && (
            <p className="text-center text-sm text-genie-ink/45 -mt-1 mb-1">
              Scanned {when}
            </p>
          )}
          <Report data={data} loggedIn={true} saved={false} comparison={null} scanId={params.id} />
        </>
      )}
    </main>
  );
}
