// app/api/recover/import/route.js
// POST { contacts:[rows], offer } -> normalize the uploaded rows, classify each
// contact, draft a specific win-back email per person, and persist them (actions table,
// type "recovery", excluded from Approvals). Returns how many were imported. The rows
// are parsed from the CSV on the client, so this takes plain JSON.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostOf } from "@/lib/business";
import { batchRecover, normalizeContact } from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const offer = String(body?.offer || "").slice(0, 240);
  const rawRows = Array.isArray(body?.contacts) ? body.contacts : [];
  if (!rawRows.length) return json({ ok: false, error: "No rows found in that file." }, 400);

  const seen = new Set();
  let contacts = rawRows.map(normalizeContact).filter((c) => {
    const e = c.email.toLowerCase();
    if (!EMAIL_RE.test(c.email) || seen.has(e)) return false;
    seen.add(e); return true;
  });
  if (!contacts.length) return json({ ok: false, error: "Couldn't find valid email addresses. Make sure your file has an 'email' column." }, 400);
  const skipped = rawRows.length - contacts.length;
  contacts = contacts.slice(0, 45); // per-import cap; import the rest in another batch

  // Business context for the drafts.
  let business = { name: "", pitch: "", whatTheySell: "", website: "", senderName: "" };
  try {
    const { data: prof } = await supabase.from("profiles").select("company_name, company_pitch, company_website, sender_name").eq("id", userId).maybeSingle();
    if (prof) business = { name: prof.company_name || "", pitch: prof.company_pitch || "", whatTheySell: "", website: prof.company_website || "", senderName: prof.sender_name || "" };
  } catch {}
  let host = null;
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { host = hostOf(scan); const ai = scan.ai || {}; business.name = business.name || ai.businessName || ""; business.whatTheySell = ai.whatTheySell || ""; business.pitch = business.pitch || ai.whyChooseYou || ai.whatTheySell || ""; business.website = business.website || (host ? `https://${host}` : ""); }
  } catch {}

  // Draft in chunks (rate-limit safe); batchRecover templates any the AI misses.
  const drafted = [];
  for (let i = 0; i < contacts.length; i += 15) drafted.push(...await batchRecover(contacts.slice(i, i + 15), business, offer));

  const admin = createAdminClient();
  const rows = drafted.map((d) => ({
    user_id: userId, type: "recovery",
    title: `Win-back: ${d.name || d.email}`.slice(0, 200),
    target: { host: host || null, segment: d.segment },
    priority: "high", status: "proposed",
    payload: { name: d.name, email: d.email, company: d.company, dealValue: d.dealValue, lastContact: d.lastContact, notes: d.notes, segment: d.segment, subject: d.subject, body: d.body, offer, sent: false, sentAt: null, outcome: null },
  }));
  const { data: ins, error } = await admin.from("actions").insert(rows).select("id");
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, imported: (ins || []).length, skipped });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
