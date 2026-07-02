"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ActionDetailPage({ params }) {
  return (
    <Suspense fallback={null}>
      <ActionDetail id={params.id} />
    </Suspense>
  );
}

function ActionDetail({ id }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const business = searchParams.get("business") || "";
  const [state, setState] = useState("loading");
  const [action, setAction] = useState(null);
  const [working, setWorking] = useState(false);

  const backHref = business
    ? `/dashboard?business=${encodeURIComponent(business)}`
    : "/dashboard";

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      try {
        const res = await fetch(`/api/actions/${id}`);
        const j = await res.json();
        if (!active) return;
        if (!j.ok || !j.action) setState("notfound");
        else { setAction(j.action); setState("ready"); }
      } catch { if (active) setState("notfound"); }
    })();
    return () => { active = false; };
  }, [id, router]);

  async function dismiss() {
    setWorking(true);
    try {
      await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "dismissed" }),
      });
      router.push(backHref);
    } catch { setWorking(false); }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center gap-2 border-b border-genie-ink/10">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg genie-gradient" aria-hidden />
          <span className="font-bold tracking-tight text-genie-ink">Marketing Genie</span>
        </a>
        <a href={backHref} className="ml-auto text-sm text-genie-purple font-medium hover:underline">← Back</a>
      </header>

      <section className="flex-1 px-6 py-6">
        <div className="max-w-2xl mx-auto">
          <nav className="text-xs text-genie-ink/45 flex items-center gap-1.5 flex-wrap">
            <a href="/dashboard" className="hover:text-genie-ink">Dashboard</a>
            <span>›</span>
            <a href={backHref} className="hover:text-genie-ink">{business || "Business"}</a>
            <span>›</span>
            <span className="text-genie-ink/70">Action</span>
          </nav>

          {state === "loading" && <p className="mt-10 text-center text-genie-ink/50">Loading…</p>}

          {state === "notfound" && (
            <div className="mt-10 text-center">
              <p className="text-genie-ink/70">That action couldn't be found.</p>
              <a href={backHref} className="mt-3 inline-block text-genie-purple font-medium hover:underline">← Back to dashboard</a>
            </div>
          )}

          {state === "ready" && action && (
            <>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="text-2xl">{iconFor(action.type)}</span>
                <h1 className="text-xl font-extrabold text-genie-ink">{action.title || action.type}</h1>
                <span className="text-xs bg-genie-mist border border-genie-ink/10 rounded-full px-2 py-0.5 text-genie-ink/60 capitalize">{action.status}</span>
              </div>

              <div className="mt-5 bg-white border border-genie-ink/10 rounded-2xl p-6 shadow-sm">
                <ActionBody action={action} />
              </div>

              <div className="mt-5 flex items-center gap-3 flex-wrap">
                <button
                  disabled
                  title="Auto-publish arrives with the WordPress / Shopify / social integrations"
                  className="genie-gradient text-white font-semibold px-5 py-2.5 rounded-xl opacity-70 cursor-not-allowed flex items-center gap-2"
                >
                  🚀 Approve & publish
                  <span className="text-[10px] bg-white/25 rounded-full px-2 py-0.5">coming soon</span>
                </button>
                <button onClick={dismiss} disabled={working} className="text-sm text-genie-ink/60 hover:text-red-500 disabled:opacity-50">Dismiss</button>
                <button disabled title="Editing arrives soon" className="text-sm text-genie-ink/35 cursor-not-allowed">Edit · soon</button>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function ActionBody({ action }) {
  const p = action.payload || {};
  if (action.type === "article") {
    return (
      <div>
        <h2 className="text-lg font-bold text-genie-ink">{p.title}</h2>
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {p.targetKeyword && <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">🎯 {p.targetKeyword}</span>}
          {p.wordCount && <span className="bg-genie-mist border border-genie-ink/10 rounded-full px-2 py-0.5 text-genie-ink/55">{p.wordCount} words</span>}
        </div>
        {p.metaDescription && <p className="mt-2 text-sm text-genie-ink/55 italic">{p.metaDescription}</p>}
        <div className="mt-3 border-t border-genie-ink/5 pt-3"><Markdown text={p.body || ""} /></div>
      </div>
    );
  }
  if (action.type === "social_post") {
    return (
      <div>
        <span className="text-xs bg-genie-mist border border-genie-ink/10 rounded-full px-2 py-0.5 text-genie-ink/60">{p.platform}</span>
        <p className="mt-3 text-genie-ink/85 whitespace-pre-wrap leading-relaxed">{p.text}</p>
      </div>
    );
  }
  return <pre className="text-sm text-genie-ink/75 whitespace-pre-wrap">{JSON.stringify(p, null, 2)}</pre>;
}

function iconFor(t) {
  return t === "article" ? "📝" : t === "social_post" ? "📣" : t === "seo_fix" ? "🔧" : t === "outreach_email" ? "✉️" : t === "ad_campaign" ? "📢" : "⚡";
}

function Markdown({ text }) {
  const lines = String(text).split("\n");
  const out = [];
  lines.forEach((line, i) => {
    const l = line.trim();
    if (!l) return;
    if (l.startsWith("## ")) out.push(<h4 key={i} className="font-bold text-genie-ink mt-4">{l.slice(3)}</h4>);
    else if (l.startsWith("### ")) out.push(<h5 key={i} className="font-semibold text-genie-ink mt-3">{l.slice(4)}</h5>);
    else if (l.startsWith("# ")) out.push(<h3 key={i} className="text-lg font-bold text-genie-ink mt-4">{l.slice(2)}</h3>);
    else if (l.startsWith("- ") || l.startsWith("* ")) out.push(<li key={i} className="text-sm text-genie-ink/75 ml-4 list-disc">{l.slice(2)}</li>);
    else out.push(<p key={i} className="text-sm text-genie-ink/75 mt-2 leading-relaxed">{l}</p>);
  });
  return <div>{out}</div>;
}
