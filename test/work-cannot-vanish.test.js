// test/work-cannot-vanish.test.js
// ── THE TESTS THIS CODEBASE KEPT NOT HAVING ──
//
// Every test file here proves a function returns the right answer. Not one of them
// proved a function was REACHED, or that what it produced arrived anywhere. So the
// suite stayed green through: a country ranking that reached no engine, a keyword
// volume measured in the wrong country, a company-to-country match that read a
// field nothing writes, an article held back and hidden from the only person who
// could release it, and a queue that told the owner 62 items were waiting while
// being structurally unable to show twelve of them.
//
// These are connection tests. Each one pins a place where finished work used to be
// able to disappear with nobody told.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");
const approvals = read("app/api/approvals/route.js");
const act = read("app/api/approvals/act/route.js");
const campaign = read("app/api/outreach/campaign/route.js");
const selftest = read("lib/selftest.js");

describe("the queue can reach its own backlog", () => {
  // `.limit(50)` with no `.order()` lets Postgres return whichever fifty it likes.
  // countWaiting counts exactly, so the screen could say "62 waiting" and never be
  // able to hand over twelve of them — and expireStaleDrafts retires unreachable
  // drafts at fourteen days.
  it("orders before it cuts", () => {
    // Comments stripped first: the comment explaining the fix mentions .limit(50).
    const code = approvals.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10));
    const from = code.indexOf('.from("actions")');
    const q = code.slice(from, code.indexOf(";", code.indexOf(".limit(", from)));
    expect(q).toMatch(/\.order\("created_at", \{ ascending: false \}\)/);
    expect(q.indexOf('.order("created_at"')).toBeLessThan(q.indexOf(".limit("));
  });

  it("asking for everything asks for more than the default page", () => {
    expect(approvals).toMatch(/\.limit\(showAll \? 250 : 50\)/);
  });

  it("no unordered limit is left anywhere in the queue", () => {
    const unordered = approvals
      .split("\n")
      .filter((l) => /\.limit\(\d+\)/.test(l) && !/order|countWaiting/.test(l) && !l.trim().startsWith("//"));
    // The pitch and placement reads have their own ordering; assert each surviving
    // bare limit sits next to an order() in its own statement rather than trusting
    // the line in isolation.
    for (const line of unordered) {
      const at = approvals.indexOf(line);
      const stmt = approvals.slice(Math.max(0, at - 400), at + line.length);
      expect(stmt, `unordered limit: ${line.trim()}`).toMatch(/\.order\(/);
    }
  });
});

describe("a draft is only counted when it exists", () => {
  // supabase-js RETURNS its errors rather than throwing, so this insert could fail
  // and the function still looked like it had worked. The activity feed then told
  // the owner "5 outreach emails are waiting for you to approve" and Approvals was
  // empty — on the one screen whose job is to prove Genie did something.
  it("the staging insert's error is read", () => {
    expect(campaign).toMatch(/const \{ error: stageErr \} = await supabase\.from\("actions"\)\.insert/);
    expect(campaign).toMatch(/if \(stageErr\)/);
  });

  it("staging says whether it worked, and the caller believes it", () => {
    expect(campaign).toMatch(/const didStage = await stageForApproval/);
    expect(campaign).toMatch(/if \(didStage\) staged\+\+/);
    // The unconditional increment is gone, not merely guarded somewhere else.
    expect(campaign).not.toMatch(/^\s*staged\+\+;\s*$/m);
  });

  it("a failure to stage leaves a trace a developer can find", () => {
    expect(campaign).toMatch(/outreach\.stage_failed/);
    expect(campaign).toMatch(/outreach\.stage_threw/);
    expect(campaign).toMatch(/import \{ logger \} from "@\/lib\/log"/);
  });

  it("the owner is only told about emails that are really waiting", () => {
    const at = campaign.indexOf("waiting for you to approve");
    expect(at).toBeGreaterThan(-1);
    expect(campaign.slice(at - 200, at)).toMatch(/if \(staged > 0\)/);
  });
});

describe("approving something leaves a mark", () => {
  // Nothing in the codebase reads status "approved" — one write, zero reads. Every
  // social post, Google Business post, review request and listing ends there. That
  // is a legitimate finish for draft-and-you-post work; a finish with no record is
  // indistinguishable from losing it.
  it("writes to the activity feed, not only to the decision log", () => {
    const at = act.indexOf('status: "approved"');
    expect(at).toBeGreaterThan(-1);
    const around = act.slice(Math.max(0, at - 1200), at + 1200);
    expect(around).toMatch(/logActivity\(supabase, user\.id/);
    expect(around).toMatch(/verb: "approved"/);
  });

  it("no longer claims there is a publish queue picking it up", () => {
    // The phrase survives only inside the comment explaining that it was wrong.
    const code = act.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(" ");
    expect(code).not.toMatch(/enters publish queue/);
    expect(act).toMatch(/There is no publish queue/);
  });
});

describe("the self-test can go red when nothing is produced", () => {
  // Every other row checks something CAN work. None asked the only question an
  // owner has, which is how each of these bugs stayed invisible while the report
  // was green.
  it("counts what the last 48 hours actually made", () => {
    expect(selftest).toMatch(/id: "produced"/);
    expect(selftest).toMatch(/articles written/);
    expect(selftest).toMatch(/emails sent/);
  });

  it("fails on nothing at all, and warns on written-but-never-delivered", () => {
    const row = selftest.slice(selftest.indexOf('id: "produced"'), selftest.indexOf('id: "markets"'));
    expect(row).toMatch(/if \(total === 0\)[\s\S]{0,200}return fail\(/);
    expect(row).toMatch(/emailsDrafted > 0 && emailsSent === 0/);
    expect(row).toMatch(/articles > 0 && published === 0/);
  });
});

describe("no send path can reach a stranger without an unsubscribe link", () => {
  // /api/outreach/send was dead and unsafe at the same time: no unsubscribe, no
  // opt-out check, no outreach_log row, so its sends were invisible to the daily
  // cap and to the list that stops Genie writing to the same person twice. It is
  // closed; this is the rule that stops the next one being written.
  const SENDERS = [
    "app/api/actions/[id]/execute/route.js",
    "app/api/outreach/campaign/route.js",
    "app/api/prospects/send/route.js",
    "app/api/announce/route.js",
  ];

  it("every live send path passes an unsubscribe url and checks suppression", () => {
    for (const f of SENDERS) {
      const src = read(f);
      expect(src, `${f} has no unsubscribe url`).toMatch(/unsubscribeUrl|unsubUrl/);
      expect(src, `${f} never checks isSuppressed`).toMatch(/isSuppressed/);
    }
  });

  it("the closed one is closed, and says why", () => {
    const src = read("app/api/outreach/send/route.js");
    expect(src).toMatch(/status: 410/);
    expect(src).not.toMatch(/deliverEmail/);
  });

  it("the two retired routes can no longer fill the approvals queue", () => {
    for (const f of ["app/api/distribute/route.js", "app/api/growth/route.js"]) {
      const src = read(f);
      expect(src, `${f} still writes to actions`).not.toMatch(/from\("actions"\)/);
      expect(src).toMatch(/status: 410/);
    }
  });
});

describe("the capabilities page does not promise what the product does not do", () => {
  // app/trust/page.js was rewritten because the seven-channel ramp was not real.
  // The capabilities page went on describing it for months afterwards.
  it("claims the ramp only for the channel that has one", () => {
    const caps = read("app/capabilities/page.js");
    expect(caps).not.toMatch(/Every channel starts needing your approval/);
    expect(caps).toMatch(/the only channel with a ramp/);
  });
});

describe("one escalation ladder, not two", () => {
  // lib/keyword-plan.js exported nextMove with zero callers while app/growth
  // re-implemented the same six states in its own words. Two ladders drift, and
  // the one that drifts is always the one the owner reads.
  it("the page uses the library's ladder", () => {
    const page = read("app/growth/page.js");
    expect(page).toMatch(/import \{ campaignStatus, difficultyTier, nextMove \}/);
    expect(page).toMatch(/nextMove\(s\)\.why/);
    expect(page).not.toMatch(/function moveFor/);
  });

  it("does not claim Genie acts on rungs it does not act on", () => {
    // Genie writes the page for not_started, escalates a stalled one, refreshes a
    // won one. It does nothing for indexing, working or climbing, so calling all
    // six "Genie's next move" promised three things that never happen.
    const page = read("app/growth/page.js");
    expect(page).not.toMatch(/next move:/i);
    expect(page).toMatch(/What this needs now:/);
  });
});

describe("an engine that stops says so somewhere that lasts", () => {
  // The nightly run starts each engine and lets go on purpose — waiting would get
  // the orchestrator killed at Vercel's 60 seconds and the rest of the pipeline
  // would never start. The cost is that everything these routes return goes into a
  // reply nobody is holding. Neither recorded a single event, so an owner whose
  // Gmail disconnected got "Connect Gmail on the Connections page" every night for
  // ever, at HTTP 200, four seconds after the caller walked away.
  const content = read("app/api/content/route.js");

  it("the writing engine records a night it produced nothing", () => {
    expect(content).toMatch(/type: "content\.skipped"/);
    expect(content).toMatch(/reportSkipped\(supabase, userId, host, "writer_unavailable"/);
    expect(content).toMatch(/reportSkipped\(supabase, userId, host, "all_providers_busy"/);
  });

  it("the outreach engine records why it could not send", () => {
    expect(campaign).toMatch(/type: "outreach\.blocked"/);
    expect(campaign).toMatch(/reportBlocked\(supabase, userId, host, "no_sender"/);
    expect(campaign).toMatch(/reportBlocked\(supabase, userId, host, "sender_failed"/);
  });

  it("one row per reason per day, not one per contact", () => {
    // A disconnected mailbox would otherwise write a row for every company in the
    // night's list, and bury the worklog under its own error.
    expect(campaign).toMatch(/dedupeKey: `outreach-blocked:\$\{reason\}:/);
    expect(content).toMatch(/dedupeKey: `content-skipped:\$\{reason\}:/);
  });

  it("the self-test reads them, so 'nothing produced' can say why", () => {
    expect(selftest).toMatch(/\.in\("type", \["outreach\.blocked", "content\.skipped"\]\)/);
    expect(selftest).toMatch(/The reason is in the detail beside this row/);
  });
});

describe("nothing offers a connection that cannot exist", () => {
  // X was dead in three independent places at once — no link to the connect flow,
  // the queue never marks a social post sendable, and Approvals copies to the
  // clipboard before any send. Four screens went on implying it was connectable.
  it("the connections page does not claim X can be connected", () => {
    const page = read("app/connections/page.js");
    // Comments stripped: the phrase survives in the note explaining it was wrong.
    const code = page.split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
      .join(String.fromCharCode(10));
    expect(code).not.toMatch(/X connected/);
    expect(code).not.toMatch(/I\.x\.connected/);
    expect(code).not.toMatch(/X_ERRORS|x_error|x_connected/);
    // The copy-and-paste flow it really has is still described.
    expect(page).toMatch(/Nothing to connect/);
  });

  it("the status route does not report X as a connection", () => {
    const status = read("app/api/connections/status/route.js");
    expect(status).not.toMatch(/x: \{ label: "X \(Twitter\)"/);
  });

  it("the trust ramp is computed only for channels that have one", () => {
    const trust = read("app/api/trust/route.js");
    expect(trust).toMatch(/const CHANNELS = \["blog", "email"\]/);
  });

  it("the OAuth routes say why rather than half-working", () => {
    for (const f of ["app/api/connect/x/route.js", "app/api/connect/x/start/route.js", "app/api/connect/x/callback/route.js"]) {
      expect(read(f)).toMatch(/status: 410/);
    }
  });
});

describe("the publish guard's middle verdict is not thrown away", () => {
  // It grades everything publish / review / block and only "block" was handled,
  // so an article with an unverified-sounding claim went live on the owner's own
  // domain, under their name, with nobody told.
  const execute = read("app/api/actions/[id]/execute/route.js");

  it("a flagged article still publishes, so the machine does not stall", () => {
    expect(execute).toMatch(/if \(guard\.decision === "review"\)/);
    // No early return inside the review branch: it records and falls through.
    const at = execute.indexOf('if (guard.decision === "review")');
    const branch = execute.slice(at, execute.indexOf("REFRESH branch", at));
    expect(branch).not.toMatch(/return json/);
  });

  it("but the owner is told the same day, with the sentences not a count", () => {
    expect(execute).toMatch(/type: "publish\.flagged"/);
    expect(execute).toMatch(/lines" : "line"\} worth checking|worth checking/);
    expect(execute).toMatch(/detail: claims\.length \? claims\.join/);
  });

  it("and the flag is stored on the action, not only announced once", () => {
    expect(execute).toMatch(/result: reviewNote \? \{ \.\.\.result, flagged: reviewNote \} : result/);
    // Declared before the first branch that can finish, or the email path throws.
    expect(execute.indexOf("let reviewNote = null;")).toBeLessThan(execute.indexOf("result: reviewNote ?"));
  });
});
