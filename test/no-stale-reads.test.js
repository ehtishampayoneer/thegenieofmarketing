// test/no-stale-reads.test.js
// Next 14 answers a GET fetch() from its Data Cache, forever, unless told not to,
// and `dynamic = "force-dynamic"` does not tell it. The ARQR blog listed an article
// that no longer existed for that reason. These tests pin the two things that stop
// it: every Supabase request goes out as no-store, and every route or page that
// asks to be dynamic also refuses the fetch cache.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

vi.mock("next/headers", () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }));

function captureFetch() {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input?.url || input), init: init || {} });
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

describe("every Supabase read skips the fetch cache", () => {
  let cap;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    cap = captureFetch();
  });
  afterEach(() => cap.restore());

  it("the admin client (the public blog, /p, sitemaps, the cron)", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient().from("published_pages").select("*").eq("handle", "x").eq("slug", "y").maybeSingle();
    const rest = cap.calls.filter((c) => c.url.includes("/rest/v1/published_pages"));
    expect(rest.length).toBe(1);
    expect(rest[0].init.cache).toBe("no-store");
  });

  it("the signed-in user's client", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    await createClient().from("actions").select("id").limit(1);
    const rest = cap.calls.filter((c) => c.url.includes("/rest/v1/actions"));
    expect(rest.length).toBe(1);
    expect(rest[0].init.cache).toBe("no-store");
  });
});

describe("force-dynamic always comes with force-no-store", () => {
  function walk(dir, out = []) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(js|jsx)$/.test(f)) out.push(p);
    }
    return out;
  }
  const files = walk(join(process.cwd(), "app")).filter((f) => /export const dynamic = "force-dynamic"/.test(readFileSync(f, "utf8")));

  it("finds the files it is guarding", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no route or page opts into dynamic rendering and still caches its fetches", () => {
    const missing = files.filter((f) => !/export const fetchCache = "force-no-store"/.test(readFileSync(f, "utf8")));
    expect(missing.map((f) => f.replace(process.cwd(), ""))).toEqual([]);
  });
});
