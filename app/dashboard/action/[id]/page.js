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
  const [pubErr, setPubErr] = useState("");

  const backHref = business ? `/dashboard?business=${encodeURIComponent(business)}` : "/dashboard";

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

  async function setStatus(status) {
    setWorking(true);
    try {
      const res = await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const j = await res.json();
      if (j.ok) {
        if (status === "dismissed") { router.push(backHref); return; }
        setAction((a) => ({ ...a, status }));
      }
    } catch {}
    setWorking(false);
  }

  async function publish() {
    setWorking(true);
    setPubErr("");
    try {
      const res = await fetch(`/api/actions/${id}/execute`, { method: "POST" });
      const j = await res.json();
      if (j.ok) setAction((a) => ({ ...a, status: "done", result: j.result }));
      else setPubErr(j.error || "Publishing failed.");
    } catch { setPubErr("Publishing failed — try again."); }
    setWorking(false);
  }

  return (
    <main className="min-h-screen flex flex-col bg-canvas">
      <header className="px-6 py-5 flex items-center gap-2 border-b border-ink-900/[0.06] bg-surface">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg grad-genie" aria-hidden />
          <span className="font-bold tracking-tight text-ink-900">Marketing Genie</span>
        </a>
        <a href={backHref} className="ml-auto text-sm text-brand-violet font-medium hover:underline">← Back</a>
      </header>

      <section className="flex-1 px-6 py-6">
        <div className="max-w-xl mx-auto">
          <nav className="text-xs text-ink-400 flex items-center gap-1.5 flex-wrap">
            <a href="/dashboard" className="hover:text-ink-900">Dashboard</a>
            <span>›</span>
            <a href={backHref} className="hover:text-ink-900">{business || "Business"}</a>
            <span>›</span>
            <span className="text-ink-600">Action</span>
          </nav>

          {state === "loading" && <p className="mt-10 text-center text-ink-400">Loading…</p>}
          {state === "notfound" && (
            <div className="mt-10 text-center">
              <p className="text-ink-600">That action couldn't be found.</p>
              <a href={backHref} className="mt-3 inline-block text-brand-violet font-medium hover:underline">← Back to dashboard</a>
            </div>
          )}

          {state === "ready" && action && (
            <>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-extrabold text-ink-900 flex-1 min-w-0 truncate">{action.title || action.type}</h1>
                <StatusBadge status={action.status} />
              </div>

              <div className="mt-4">
                <ActionPreview action={action} />
              </div>

              <PrimaryCTA
                action={action}
                working={working}
                onPublish={publish}
                onApprove={() => setStatus("approved")}
                onSkip={() => setStatus("dismissed")}
              />
              {pubErr && (
                <p className="mt-2 text-sm text-amber-700">
                  {pubErr}{pubErr.includes("Connect your WordPress") && (
                    <> <a href="/dashboard?view=integrations" className="underline font-medium">Open Integrations →</a></>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }) {
  const map = {
    proposed: ["bg-amber-50 text-amber-700 border-amber-200", "Proposed"],
    approved: ["bg-emerald-50 text-emerald-700 border-emerald-200", "✓ Approved"],
    done: ["bg-emerald-50 text-emerald-700 border-emerald-200", "✓ Published"],
    failed: ["bg-red-50 text-red-600 border-red-200", "Failed"],
    executing: ["bg-brand-violet/10 text-brand-violet border-brand-violet/20", "Publishing…"],
    dismissed: ["bg-ink-900/[0.04] text-ink-400 border-ink-900/[0.08]", "Skipped"],
  };
  const [cls, label] = map[status] || map.proposed;
  return <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${cls}`}>{label}</span>;
}

// ---------- ONE primary CTA per action type ----------
function PrimaryCTA({ action, working, onPublish, onApprove, onSkip }) {
  const p = action.payload || {};
  const done = action.status === "done";
  const skippable = !done && action.status !== "dismissed";

  let primary = null;
  if (done && action.result?.url) {
    primary = (
      <a href={action.result.url} target="_blank" rel="noreferrer"
        className="flex-1 text-center bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold px-5 py-3 rounded-xl hover:bg-emerald-100 transition">
        ✓ Published — view live ↗
      </a>
    );
  } else if (done) {
    primary = <span className="flex-1 text-center text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">✓ Done</span>;
  } else if (action.type === "article") {
    primary = (
      <button onClick={onPublish} disabled={working}
        className="flex-1 grad-genie text-white font-semibold px-5 py-3 rounded-xl active:scale-[0.99] disabled:opacity-60">
        {working ? "Publishing…" : action.status === "failed" ? "🚀 Retry publish" : "🚀 Publish now"}
      </button>
    );
  } else if (action.type === "outreach_email") {
    const { subject, body } = splitEmail(p.draft || "");
    primary = (
      <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
        className="flex-1 text-center grad-genie text-white font-semibold px-5 py-3 rounded-xl active:scale-[0.99]">
        ✉️ Send from your email
      </a>
    );
  } else if (action.target?.humanPost || action.type === "community_engagement") {
    primary = <CopyAndGo payload={p} />;
  } else if (action.status === "proposed") {
    primary = (
      <button onClick={onApprove} disabled={working}
        className="flex-1 grad-genie text-white font-semibold px-5 py-3 rounded-xl active:scale-[0.99] disabled:opacity-60">
        🚀 Approve
      </button>
    );
  } else if (action.status === "approved") {
    primary = (
      <span className="flex-1 text-center text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
        ✓ Approved — publishes when its integration connects
      </span>
    );
  }

  return (
    <div className="mt-5">
      <div className="flex items-stretch gap-2">{primary}</div>
      <div className="mt-2 flex items-center gap-4 justify-center">
        <button disabled title="Editing arrives soon" className="text-xs text-ink-400/60 cursor-not-allowed">Edit · soon</button>
        {skippable && (
          <button onClick={onSkip} disabled={working} className="text-xs text-ink-400 hover:text-red-500 disabled:opacity-50">Skip</button>
        )}
      </div>
      {(action.target?.humanPost || action.type === "community_engagement") && !done && (
        <p className="mt-2 text-[11px] text-ink-400 text-center">
          ✍️ Drafted for you to post from your own account — Genie never auto-posts community or outreach.
        </p>
      )}
    </div>
  );
}

function CopyAndGo({ payload }) {
  const [copied, setCopied] = useState(false);
  const draft = Array.isArray(payload.draft) ? payload.draft.join("\n\n") : (payload.draft || payload.text || "");
  const target = payload.suggestedTarget || "";
  const url = /^r\//i.test(target) ? `https://www.reddit.com/${target}` : null;

  async function go() {
    try { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
    if (url) window.open(url, "_blank");
  }
  return (
    <button onClick={go}
      className="flex-1 grad-genie text-white font-semibold px-5 py-3 rounded-xl active:scale-[0.99]">
      {copied ? "✓ Copied!" : url ? `📋 Copy draft & open ${target}` : "📋 Copy draft — you post it"}
    </button>
  );
}

// ---------- Preview-first bodies ----------
function ActionPreview({ action }) {
  const p = action.payload || {};
  switch (action.type) {
    case "article": return <ArticlePreview p={p} />;
    case "social_post": return <SocialMockup platform={p.platform} text={p.text} />;
    case "distribution": return <DistributionPreview p={p} />;
    case "community_engagement": return <CommunityPreview p={p} />;
    case "outreach_email": return <EmailPreview p={p} />;
    case "directory_submission": return <DirectoryPreview p={p} />;
    default:
      return <pre className="text-sm text-ink-600 bg-surface border border-ink-900/[0.06] rounded-2xl p-5 whitespace-pre-wrap">{JSON.stringify(p, null, 2)}</pre>;
  }
}

function ArticlePreview({ p }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-2xl overflow-hidden shadow-sm">
      {/* Feature image placeholder */}
      <div className="h-36 grad-genie relative">
        <span className="absolute bottom-3 left-4 text-[11px] text-white/70 bg-white/15 rounded-full px-2 py-0.5">
          featured image — auto-generated soon
        </span>
      </div>
      <div className="p-5">
        <div className="flex flex-wrap gap-1.5">
          {p.targetKeyword && (
            <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">🎯 {p.targetKeyword}</span>
          )}
          {p.wordCount && (
            <span className="text-[11px] bg-ink-900/[0.04] text-ink-600 border border-ink-900/[0.08] rounded-full px-2 py-0.5 font-mono">{p.wordCount} words</span>
          )}
        </div>
        <h2 className="mt-2 text-lg font-bold text-ink-900 leading-snug">{p.title}</h2>
        {/* Google-result style meta preview */}
        {(p.metaTitle || p.metaDescription) && (
          <div className="mt-3 bg-surface2 border border-ink-900/[0.06] rounded-xl p-3">
            <p className="text-[11px] text-ink-400 mb-1">How it looks on Google</p>
            <p className="text-sm text-[#1a0dab] leading-tight">{p.metaTitle || p.title}</p>
            <p className="text-[11px] text-emerald-700">{p.slug ? `yoursite.com/${p.slug}` : "yoursite.com"}</p>
            <p className="text-xs text-ink-600 mt-0.5">{p.metaDescription}</p>
          </div>
        )}
        <button onClick={() => setOpen((v) => !v)} className="mt-3 text-sm text-brand-violet font-medium hover:underline">
          {open ? "Hide full article ▲" : "Read full article ▼"}
        </button>
        {open && (
          <div className="mt-2 border-t border-ink-900/[0.06] pt-3 max-h-96 overflow-y-auto thin-scroll">
            <MiniMarkdown text={p.body || ""} />
          </div>
        )}
      </div>
    </div>
  );
}

function SocialMockup({ platform, text }) {
  const pf = String(platform || "").toLowerCase();
  if (pf.includes("twitter") || pf.includes("x")) return <TweetMock text={text} />;
  if (pf.includes("linkedin")) return <LinkedInMock text={text} />;
  if (pf.includes("instagram")) return <InstaMock text={text} />;
  return <FacebookMock text={text} />;
}

function Avatar({ shape = "rounded-full", size = "w-10 h-10" }) {
  return <div className={`${size} ${shape} grad-genie shrink-0`} aria-hidden />;
}

function TweetMock({ text }) {
  return (
    <div className="bg-white border border-ink-900/[0.08] rounded-2xl p-4 shadow-sm">
      <div className="flex gap-3">
        <Avatar />
        <div className="flex-1 min-w-0">
          <p className="text-sm"><span className="font-bold text-ink-900">Your Brand</span> <span className="text-ink-400">@yourbrand · now</span></p>
          <p className="mt-1 text-[15px] text-ink-900 whitespace-pre-wrap leading-snug">{text}</p>
          <div className="mt-3 flex justify-between text-ink-400 text-sm max-w-[260px]">
            <span>💬 12</span><span>🔁 34</span><span>❤️ 128</span><span>📊 4.2k</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedInMock({ text }) {
  return (
    <div className="bg-white border border-ink-900/[0.08] rounded-xl shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex gap-3">
          <Avatar shape="rounded-lg" size="w-11 h-11" />
          <div>
            <p className="text-sm font-semibold text-ink-900">Your Brand</p>
            <p className="text-xs text-ink-400">Company · Promoted your growth · now</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-900 whitespace-pre-wrap leading-relaxed">{text}</p>
      </div>
      <div className="border-t border-ink-900/[0.06] px-4 py-2 flex justify-around text-xs text-ink-400">
        <span>👍 Like</span><span>💬 Comment</span><span>🔁 Repost</span><span>📤 Send</span>
      </div>
    </div>
  );
}

function InstaMock({ text }) {
  return (
    <div className="bg-white border border-ink-900/[0.08] rounded-xl shadow-sm overflow-hidden max-w-sm mx-auto">
      <div className="px-3 py-2.5 flex items-center gap-2">
        <Avatar size="w-8 h-8" />
        <span className="text-sm font-semibold text-ink-900">yourbrand</span>
      </div>
      <div className="aspect-square grad-accent flex items-center justify-center">
        <span className="text-[11px] text-white/70 bg-white/15 rounded-full px-2 py-0.5">visual auto-generated soon</span>
      </div>
      <div className="px-3 py-2.5">
        <div className="flex gap-3 text-lg">❤️ 💬 📤</div>
        <p className="mt-1.5 text-sm text-ink-900 whitespace-pre-wrap"><span className="font-semibold">yourbrand</span> {text}</p>
      </div>
    </div>
  );
}

function FacebookMock({ text }) {
  return (
    <div className="bg-white border border-ink-900/[0.08] rounded-xl shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex gap-3 items-center">
          <Avatar />
          <div>
            <p className="text-sm font-semibold text-ink-900">Your Brand</p>
            <p className="text-xs text-ink-400">Just now · 🌐</p>
          </div>
        </div>
        <p className="mt-3 text-[15px] text-ink-900 whitespace-pre-wrap leading-relaxed">{text}</p>
      </div>
      <div className="border-t border-ink-900/[0.06] px-4 py-2 flex justify-around text-xs text-ink-400">
        <span>👍 Like</span><span>💬 Comment</span><span>↪️ Share</span>
      </div>
    </div>
  );
}

function DistributionPreview({ p }) {
  const draft = Array.isArray(p.draft) ? p.draft.join("\n\n") : p.draft;
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-ink-900">🌐 {p.channel}</span>
        {p.humanPost
          ? <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">✍️ you post</span>
          : <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">↗ reach</span>}
        {p.suggestedTarget && <span className="text-[11px] bg-ink-900/[0.04] text-ink-600 rounded-full px-2 py-0.5">{p.suggestedTarget}</span>}
      </div>
      {p.articleTitle && <p className="mt-2 text-sm text-ink-600">Distributing: <span className="font-medium text-ink-900">{p.articleTitle}</span></p>}
      {p.framing && <p className="mt-1 text-xs text-ink-400">{p.framing}</p>}
      {p.adaptation && <p className="mt-1 text-xs text-ink-600">🔧 {p.adaptation}</p>}
      {draft && (
        <div className="mt-3 bg-surface2 border border-ink-900/[0.06] rounded-xl p-3 text-sm text-ink-900 whitespace-pre-wrap max-h-64 overflow-y-auto thin-scroll">{draft}</div>
      )}
    </div>
  );
}

function CommunityPreview({ p }) {
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-ink-900">💬 {p.name}</span>
        <span className="text-[11px] bg-ink-900/[0.04] text-ink-600 rounded-full px-2 py-0.5">{p.platform}</span>
        {p.rhythm && <span className="text-[11px] bg-ink-900/[0.04] text-ink-600 rounded-full px-2 py-0.5">{p.rhythm}</span>}
      </div>
      {p.whyHere && <p className="mt-2 text-xs text-ink-600">{p.whyHere}</p>}
      {p.firstMove && <p className="mt-1 text-xs text-ink-600"><span className="font-medium text-ink-900">First move:</span> {p.firstMove}</p>}
      {p.draft && (
        <div className="mt-3 bg-surface2 border border-ink-900/[0.06] rounded-xl p-3 text-sm text-ink-900 whitespace-pre-wrap max-h-64 overflow-y-auto thin-scroll">{p.draft}</div>
      )}
      {p.verifyNote && <p className="mt-2 text-[11px] text-ink-400 italic">{p.verifyNote}</p>}
    </div>
  );
}

function EmailPreview({ p }) {
  const { subject, body } = splitEmail(p.draft || "");
  return (
    <div className="bg-white border border-ink-900/[0.08] rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-surface2 border-b border-ink-900/[0.06] px-4 py-3 space-y-1">
        <p className="text-xs text-ink-400">From: <span className="text-ink-900">you@yourdomain.com</span></p>
        <p className="text-xs text-ink-400">To: <span className="text-ink-900">{p.exampleTargets?.[0] || "[prospect]"}</span></p>
        <p className="text-sm font-semibold text-ink-900">{subject}</p>
      </div>
      <div className="px-4 py-4 text-sm text-ink-900 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto thin-scroll">{body}</div>
      {p.exampleTargets?.length > 0 && (
        <div className="border-t border-ink-900/[0.06] px-4 py-2.5">
          <p className="text-[11px] text-ink-400">Suggested targets (verify first): {p.exampleTargets.join(" · ")}</p>
        </div>
      )}
    </div>
  );
}

function DirectoryPreview({ p }) {
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-ink-900">📇 {p.name}</span>
        <span className="text-[11px] bg-ink-900/[0.04] text-ink-600 rounded-full px-2 py-0.5">{p.kind}</span>
      </div>
      {p.why && <p className="mt-2 text-xs text-ink-600">{p.why}</p>}
      {p.draft && (
        <div className="mt-3 bg-surface2 border border-ink-900/[0.06] rounded-xl p-3 text-sm text-ink-900 whitespace-pre-wrap max-h-64 overflow-y-auto thin-scroll">{p.draft}</div>
      )}
      {p.verifyNote && <p className="mt-2 text-[11px] text-ink-400 italic">{p.verifyNote}</p>}
    </div>
  );
}

function splitEmail(draft) {
  const text = Array.isArray(draft) ? draft.join("\n\n") : String(draft || "");
  const m = text.match(/^\s*subject\s*[:\-]\s*(.+)$/im);
  if (m) {
    const subject = m[1].trim();
    const body = text.replace(m[0], "").trim();
    return { subject, body };
  }
  return { subject: "Quick idea for you", body: text };
}

function MiniMarkdown({ text }) {
  const lines = String(text).split("\n");
  const out = [];
  lines.forEach((line, i) => {
    const l = line.trim();
    if (!l) return;
    if (l.startsWith("## ")) out.push(<h4 key={i} className="font-bold text-ink-900 mt-4">{l.slice(3)}</h4>);
    else if (l.startsWith("### ")) out.push(<h5 key={i} className="font-semibold text-ink-900 mt-3">{l.slice(4)}</h5>);
    else if (l.startsWith("# ")) out.push(<h3 key={i} className="text-lg font-bold text-ink-900 mt-4">{l.slice(2)}</h3>);
    else if (l.startsWith("- ") || l.startsWith("* ")) out.push(<li key={i} className="text-sm text-ink-600 ml-4 list-disc">{l.slice(2)}</li>);
    else out.push(<p key={i} className="text-sm text-ink-600 mt-2 leading-relaxed">{l}</p>);
  });
  return <div>{out}</div>;
}
