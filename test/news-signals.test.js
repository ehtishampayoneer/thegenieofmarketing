import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signalNote } from "@/lib/news-signals";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");
const lib = read("lib/news-signals.js");
const prospects = read("lib/prospects.js");

// ── WHY THIS EXISTS ──
// Genie is good at finding the right companies and has no idea which of them is
// about to spend money. A chain that opened ten stores last week and one that has
// done nothing for three years look identical in every list. News is the
// difference, and "saw you opened in Hamburg last month" is the one opening line
// nobody can fake.
//
// Whether it works at all is a HOST question, not a code question: GDELT refuses
// shared cloud addresses, and three attempts from this project's own machine,
// thirteen seconds apart, were all rejected with 429. So the whole thing is built
// to return nothing quietly and the deployed app answers the question itself.
function stub(fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = vi.fn(fn);
  return () => { globalThis.fetch = orig; };
}
const body = (text, status = 200) => ({ ok: status < 400, status, text: async () => text });
const articles = (arr) => body(JSON.stringify({ articles: arr }));

let n = 0;
const uniq = () => `Company${++n}`;

describe("what counts as a reason to write today", () => {
  beforeEach(() => { n += 100; });

  it("recognises money, an opening, a new boss and a launch", async () => {
    const { recentSignal } = await import("@/lib/news-signals");
    for (const [headline, want] of [
      ["Acme raises $12m Series B", "funding"],
      ["Acme opens new showroom in Hamburg", "expansion"],
      ["Acme appoints new CEO", "leadership"],
      ["Acme unveils autumn collection", "launch"],
      ["Acme reports record sales", "growth"],
    ]) {
      const name = uniq();
      const done = stub(async () => articles([{ title: headline.replace("Acme", name), url: "https://x/1", seendate: "20260920T000000Z" }]));
      const got = await recentSignal(name);
      done();
      expect(got?.signal, headline).toBe(want);
    }
  }, 60000);

  it("ignores a story that is not about them doing anything", async () => {
    const { recentSignal } = await import("@/lib/news-signals");
    const name = uniq();
    const done = stub(async () => articles([{ title: `${name} sofas reviewed by a magazine`, url: "https://x/2" }]));
    expect(await recentSignal(name)).toBe(null);
    done();
  }, 30000);

  it("requires the company to be named in the headline itself", async () => {
    // A story that merely mentions them in the body produces an opener that reads
    // as a non-sequitur to the person receiving it.
    const { recentSignal } = await import("@/lib/news-signals");
    const name = uniq();
    const done = stub(async () => articles([{ title: "Furniture retail raises record funding", url: "https://x/3" }]));
    expect(await recentSignal(name)).toBe(null);
    done();
  }, 30000);
});

describe("when the host cannot reach it", () => {
  it("treats a 429 as no news, never as an error", async () => {
    const { recentSignal } = await import("@/lib/news-signals");
    const done = stub(async () => body("Please limit requests to one every 5 seconds", 429));
    expect(await recentSignal(uniq())).toBe(null);
    done();
  }, 30000);

  it("catches a refusal dressed as a 200, which is how it actually arrives", async () => {
    // GDELT returns prose with a 200 as well as with a 429. Trusting the status
    // line would have fed "Please limit requests…" into an email.
    const { recentSignal } = await import("@/lib/news-signals");
    const done = stub(async () => body("You are making too many requests", 200));
    expect(await recentSignal(uniq())).toBe(null);
    done();
  }, 30000);

  it("says whether the deployment can reach it, for the self-test", async () => {
    const { newsReachable } = await import("@/lib/news-signals");
    let done = stub(async () => body("Please limit requests", 429));
    const bad = await newsReachable();
    done();
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/rate_limited/);
  }, 30000);

  it("paces itself below the documented floor", () => {
    expect(lib).toMatch(/const GAP_MS = 6000/);
    expect(lib).toMatch(/documented floor is one request every five seconds/);
  });
});

describe("the opener it produces", () => {
  it("forbids quoting the headline back at them", () => {
    const note = signalNote({ headline: "Acme opens in Hamburg", why: "is opening somewhere new" });
    expect(note).toMatch(/never quote the headline back at them/);
    expect(note).toMatch(/never say you read the news/);
  });

  it("tells the writer to drop it when it does not connect", () => {
    expect(signalNote({ headline: "x", why: "y" })).toMatch(/ignore it entirely and open normally/);
  });

  it("says nothing when there is nothing, because an invented opener is worse", () => {
    expect(signalNote(null)).toBe("");
    expect(signalNote({})).toBe("");
  });
});

describe("it cannot break the thing it decorates", () => {
  it("is optional inside the profiling loop", () => {
    expect(prospects).toMatch(/const \{ recentSignal \} = await import\("@\/lib\/news-signals"\)[\s\S]{0,120}\} catch \{\}/);
  });

  it("reaches the pitch prompt with its own rules", () => {
    expect(prospects).toMatch(/news: it\.news \?/);
    expect(prospects).toMatch(/"news" is something that genuinely happened/);
    expect(prospects).toMatch(/an invented opener is far worse than none/);
  });

  it("is never a source of companies, only of timing on chosen ones", () => {
    // The noise in a news feed is enormous; filtering it into a prospect list
    // would cost more than it returns.
    expect(lib).toMatch(/Not as a source of companies/);
  });

  it("has a self-test row, because only the deployment knows the answer", () => {
    const self = read("lib/selftest.js");
    expect(self).toMatch(/id: "news-signals"/);
    expect(self).toMatch(/newsReachable/);
    // And an unreachable service must read as "nothing is broken", not as a fault.
    expect(self).toMatch(/Nothing is broken and nothing is missing/);
  });
});
