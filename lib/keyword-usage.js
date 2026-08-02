// lib/keyword-usage.js
// ── THE KEYWORD → CONTENT CHAIN ──
// The glue between the keyword STRATEGY and what Genie actually writes. Three jobs:
//   selectTargets()  — pick the next keyword(s) to write for (wave-aware: win the
//                      easy, uncovered ones first; each primary gets a related cluster)
//   recordUsage()    — after Genie produces a piece, log which keyword(s) it targeted
//                      (primary + related) and advance the primary's coverage
//   getUsageMap()    — the "used in …" trail per keyword, for the transparency UI
// Every write is best-effort: if the keyword_usage table isn't migrated yet, the
// content/placement flows must never break — they just skip the ledger.

// Pick the next keywords worth writing for. Prioritises: not-yet-covered, then
// easy wins (low competition) first, then higher demand. Each primary comes with a
// small related cluster (same intent / shared words) so one focused piece can
// naturally cover a topic instead of stuffing unrelated terms together.
export async function selectTargets(supabase, userId, host, { count = 1 } = {}) {
  let keywords = [];
  try {
    const { data } = await supabase.from("keywords").select("*")
      .eq("user_id", userId).eq("host", host).neq("health", "retired").limit(200);
    keywords = data || [];
  } catch { return []; }
  if (!keywords.length) return [];

  const ranked = [...keywords].sort((a, b) => {
    const ca = a.coverage || 0, cb = b.coverage || 0;
    if (ca !== cb) return ca - cb;                       // cover the uncovered first
    const compA = a.competition ?? 50, compB = b.competition ?? 50;
    if (compA !== compB) return compA - compB;           // easy wins first (Wave 1)
    return (b.traffic_potential ?? 0) - (a.traffic_potential ?? 0); // then demand
  });

  const picks = [];
  for (const primary of ranked.slice(0, count)) {
    const stage = stageOf(primary);
    picks.push({
      keyword: primary.keyword,
      intent: primary.intent || "informational",
      competition: primary.competition ?? 50,
      stage,
      source: primary.source || null,
      // AI-search (AEO) targets: explicit gaps, plus question/comparison shapes —
      // these are the ones AI assistants actually cite, so write them citable.
      aeo: primary.source === "aeo" || stage === "problem" || stage === "compare",
      related: relatedTo(primary, keywords).slice(0, 4).map((k) => k.keyword),
    });
  }
  return picks;
}

// Find keywords topically close to a primary: shared meaningful word, or same intent.
function relatedTo(primary, all) {
  const words = tokens(primary.keyword);
  return all
    .filter((k) => k.keyword !== primary.keyword)
    .map((k) => {
      const overlap = tokens(k.keyword).filter((w) => words.includes(w)).length;
      const sameIntent = (k.intent || "") === (primary.intent || "") ? 1 : 0;
      return { k, score: overlap * 3 + sameIntent };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.k);
}

const STOP = new Set(["the", "a", "an", "for", "to", "in", "of", "on", "my", "your", "how", "best", "online", "with", "and", "or", "is", "are", "will", "can"]);
function tokens(s) {
  return String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

// Content type Genie should make for a keyword, from its journey stage / intent.
function stageOf(k) {
  const intent = k.intent || "informational";
  if (intent === "transactional") return "buy";
  if (intent === "commercial") return "compare";
  const kw = String(k.keyword || "").toLowerCase();
  if (/^(will|can|does|is|how|what|why|should)\b/.test(kw)) return "problem";
  return "learn";
}

// Log that a piece targeted these keywords, and advance the primary's coverage.
// primary: string. related: string[]. Best-effort; safe if the table is absent.
export async function recordUsage(supabase, userId, host, { primary, related = [], channel, refType, refId, title, url, status = "proposed" }) {
  if (!primary || !host) return;
  const rows = [];
  const norm = (s) => String(s || "").toLowerCase().trim();
  const p = norm(primary);
  const base = { user_id: userId, host, channel, ref_type: refType, ref_id: refId || null, title: title || null, url: url || null, status };
  rows.push({ ...base, keyword: p, role: "primary" });
  for (const r of related) {
    const rk = norm(r);
    if (rk && rk !== p) rows.push({ ...base, keyword: rk, role: "related" });
  }
  try {
    await supabase.from("keyword_usage").upsert(rows, { onConflict: "user_id,keyword,channel,ref_id", ignoreDuplicates: true });
  } catch { return; }
  // Advance coverage on the primary keyword (the piece is genuinely about it).
  try {
    const { data: kw } = await supabase.from("keywords").select("id, coverage")
      .eq("user_id", userId).eq("host", host).eq("keyword", p).maybeSingle();
    if (kw) await supabase.from("keywords").update({ coverage: (kw.coverage || 0) + 1 }).eq("id", kw.id);
  } catch {}
}

// The "used in …" trail for every keyword of a host: { keyword: [{channel,title,status,url,role}] }.
export async function getUsageMap(supabase, userId, host) {
  try {
    const { data } = await supabase.from("keyword_usage")
      .select("keyword, channel, title, url, status, role, created_at")
      .eq("user_id", userId).eq("host", host)
      .order("created_at", { ascending: false }).limit(600);
    const map = {};
    for (const r of data || []) {
      (map[r.keyword] ||= []).push({ channel: r.channel, title: r.title, url: r.url, status: r.status, role: r.role });
    }
    return map;
  } catch {
    return {};
  }
}
