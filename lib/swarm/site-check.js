// lib/swarm/site-check.js
// ── THE CROWD CHECKS YOUR OWN SITE, WITHOUT BEING ASKED ──
// "Test it before you launch" only runs when the owner presses it, so the crowd
// never looked at the most important page they own: their website. Once a week
// Genie walks in as a first-time visitor, reads the home page the way a person
// would, and lets the 1,000 react to it.
//
// It only interrupts the owner when the crowd found something real: a low score,
// or a gatekeeper (the five-second visitor, the trust checker) who would leave.
// Then it puts ONE item in Approvals with what they objected to and a better
// version to paste. A weekly "your site is fine" notification would be noise, so
// there isn't one.
//
// Genie never edits the owner's site. It hands over words; the owner pastes them.

import * as cheerio from "cheerio";
import { safeFetch } from "@/lib/ssrf";
import { extractText } from "@/lib/audit";
import { recordEvent, getEvents } from "@/lib/events";
import { logActivity } from "@/lib/activity";
import { runCrowd, newContext } from "@/lib/swarm/engine";

export const EVERY_DAYS = 7;
export const TELL_BELOW = 65;   // the crowd score under which it is worth saying

/** Has it run for this business inside the last week? */
export async function checkedRecently(admin, { userId, host, now = Date.now() }) {
  try {
    const rows = await getEvents(admin, { userId, host, types: ["swarm.sitecheck"], limit: 1 });
    return !!rows[0] && now - Date.parse(rows[0].created_at) < EVERY_DAYS * 864e5;
  } catch { return false; }
}

/** Should the owner hear about this result at all? */
export function worthTelling(crowd) {
  return !!crowd && crowd.mode !== "rules" && (crowd.score < TELL_BELOW || !!crowd.gate?.blocked);
}

/**
 * One weekly pass for one business. Never throws; returns what it did.
 */
export async function weeklySiteCheck(admin, { userId, host }) {
  try {
    if (!host || await checkedRecently(admin, { userId, host })) return { skipped: true };

    const url = `https://${host}`;
    let text = "";
    try {
      const { res } = await safeFetch(url, { headers: { "User-Agent": "MarketingGenie/1.0 (+site check)" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { skipped: true, reason: `http_${res.status}` };
      text = extractText(cheerio.load(await res.text())).slice(0, 3000);
    } catch { return { skipped: true, reason: "unreachable" }; }
    if (text.length < 80) return { skipped: true, reason: "too_little_text" };

    const ctx = newContext(admin, 150000);
    if (ctx.aiDown) return { skipped: true, reason: "ai_busy" };   // a rules-only read of a whole site is not worth showing
    const r = await runCrowd(admin, ctx, {
      userId, host, kind: "landing", text, seedKey: `site:${host}:${new Date().toISOString().slice(0, 10)}`,
      question: "Would you understand what this business sells, and would you trust it enough to buy?",
      improve: true,
    });

    const crowd = r.crowd;
    await recordEvent(admin, {
      userId, host, type: "swarm.sitecheck", actor: "genie", subject: `Home page: ${crowd.score}/100`,
      data: { url, score: crowd.score, positive: crowd.positive, objections: crowd.objections, gate: crowd.gate, improved: !!r.improvement },
    });

    if (!worthTelling(crowd)) return { checked: true, score: crowd.score, told: false };

    // One Approvals item, in the owner's words, with something to paste.
    const worry = crowd.objections?.[0]?.tag;
    const quote = crowd.quotes?.[0];
    const body = [
      `${Number(crowd.size).toLocaleString()} simulated visitors read your home page. It scored ${crowd.score}/100.`,
      worry ? `The biggest problem: ${worry} (${crowd.objections[0].count} of them raised it).` : "",
      crowd.gate?.blocked ? `${crowd.gate.name} would give up before reading on.` : "",
      quote ? `One of them said: "${quote.q}"` : "",
      r.improvement?.variant?.text ? `\nA rewritten opening the crowd preferred:\n\n${r.improvement.variant.text}` : "",
    ].filter(Boolean).join("\n");

    const { error } = await admin.from("actions").insert({
      user_id: userId, type: "seo_fix", status: "proposed", priority: crowd.score < 45 ? "high" : "medium",
      title: `Your home page scored ${crowd.score}/100 with the crowd`,
      target: { host, platform: "site" },
      payload: {
        platform: "site", url, body, impact: Math.max(40, 100 - crowd.score), crowd,
        rationale: `Genie's weekly check: 1,000 simulated visitors read ${host} as first-timers.${worry ? ` Most common objection: ${worry}.` : ""} Fixing the home page lifts every campaign that sends people to it.`,
      },
    });
    if (error) return { checked: true, score: crowd.score, told: false, error: error.message };

    await logActivity(admin, userId, {
      host, verb: "learning", icon: "🔍",
      message: `Your home page scored ${crowd.score}/100 with 1,000 simulated visitors`,
      detail: worry ? `Biggest objection: ${worry}. A rewrite is waiting in Approvals.` : "A rewrite is waiting in Approvals.",
      meta: { score: crowd.score },
    });
    return { checked: true, score: crowd.score, told: true };
  } catch { return { skipped: true, reason: "error" }; }
}
