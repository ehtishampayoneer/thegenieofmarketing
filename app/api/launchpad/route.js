// app/api/launchpad/route.js
// ── YOUR FIRST RESULTS ──
// Genie can be fully built and still earn nothing, because the few steps that
// turn drafts into results have not been taken: an article approved, Search
// Console connected, a sender name set, a pitch sent. Those are easy to lose
// among 69 capabilities, so this reports the real state of each one, read from
// the database rather than remembered, and the Today page shows it until they
// are done. Every step is either done or not; nothing here is aspirational.

import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { blogConnection } from "@/lib/own-blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const count = async (table, build) => {
    try { const { count: n } = await build(supabase.from(table).select("id", { count: "exact", head: true })); return n || 0; }
    catch { return 0; }
  };

  let host = "";
  try {
    const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) host = hostOf(data);
  } catch {}

  let profile = {};
  try { const { data } = await supabase.from("profiles").select("company_name, sender_name, sender_email, money_page_url").eq("id", user.id).maybeSingle(); profile = data || {}; }
  catch {}

  let google = null, wordpress = false;
  try {
    const { data } = await supabase.from("connections").select("provider, gsc_site").eq("user_id", user.id);
    for (const c of data || []) { if (c.provider === "google") google = c; if (c.provider === "wordpress") wordpress = true; }
  } catch {}
  const blog = await blogConnection(supabase, user.id);
  const ownDomain = !!blog?.meta?.verifiedAt || wordpress;

  const published = await count("published_pages", (q) => q.eq("user_id", user.id).eq("status", "published"));
  const waiting = await count("actions", (q) => q.eq("user_id", user.id).eq("status", "proposed"));
  const sent = await count("outreach_log", (q) => q.eq("user_id", user.id).in("status", ["sent", "opened", "replied"]));
  const replies = await count("outreach_log", (q) => q.eq("user_id", user.id).eq("status", "replied"));

  const missingDetails = [["company name", profile.company_name], ["sender name", profile.sender_name], ["the page buyers are sent to", profile.money_page_url]]
    .filter(([, v]) => !v).map(([k]) => k);

  // Ordered by what unlocks the most. Each step says what it is FOR, because
  // "connect Search Console" means nothing on its own.
  const steps = [
    {
      id: "own-domain", done: ownDomain, href: "/connections",
      t: "Articles publish to your own domain",
      why: "Articles on a Genie page build Genie's ranking. On your own domain they build yours.",
      state: ownDomain ? (blog?.meta?.base ? `Live at ${String(blog.meta.base).replace(/^https?:\/\//, "")}` : "WordPress connected") : "Not set up yet",
      cta: "Set it up",
    },
    {
      id: "publish", done: published > 0, href: "/approvals",
      t: "Approve your first article",
      why: "Nothing ranks until something is published. Each draft arrives tested by the crowd.",
      state: published > 0 ? `${published} article${published === 1 ? "" : "s"} published` : waiting > 0 ? `${waiting} waiting for you` : "Genie writes one tonight",
      cta: waiting > 0 ? `Review ${waiting}` : "Open Approvals",
    },
    {
      id: "gsc", done: !!google?.gsc_site, href: "/connections",
      t: "Let Genie see your real Google rankings",
      why: "Without it Genie is blind to positions and clicks, so it cannot prove or improve them.",
      state: google?.gsc_site ? "Connected" : google ? "Google connected, Search Console not set up" : "Google not connected",
      cta: google ? "Set it up for me" : "Connect Google",
    },
    {
      id: "details", done: missingDetails.length === 0, href: "/settings",
      t: "Add your sender details",
      why: "They go in every outreach signature and every call to action. Missing ones weaken both.",
      state: missingDetails.length ? `Missing: ${missingDetails.join(", ")}` : `Sending as ${profile.sender_name}`,
      cta: "Fill them in",
    },
    {
      id: "outreach", done: sent > 0, href: "/approvals",
      t: "Send your first pitches",
      why: "This is the fastest money: replies come in days, while ranking takes months.",
      state: sent > 0 ? `${sent} sent, ${replies} replied` : "None sent yet",
      cta: "Open Approvals",
    },
  ];

  const done = steps.filter((s) => s.done).length;
  return json({ ok: true, host, done, total: steps.length, complete: done === steps.length, steps });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
