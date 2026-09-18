import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizePath, toOwnUrl, rewriteBodyLinks, rewriteSnippets, guessHosting, markerValue, hasMarker, ownArticleUrl, indexNowOptsFor,
} from "@/lib/own-blog";

beforeEach(() => { process.env.APP_URL = "https://genie.app"; });

describe("choosing the folder", () => {
  it("accepts the ways an owner types it", () => {
    expect(normalizePath("blog", "arqr360.com")).toEqual({ ok: true, path: "/blog" });
    expect(normalizePath("/Blog/", "arqr360.com")).toEqual({ ok: true, path: "/blog" });
    expect(normalizePath("https://www.arqr360.com/guides", "arqr360.com")).toEqual({ ok: true, path: "/guides" });
    expect(normalizePath("arqr360.com/learn/articles", "arqr360.com")).toEqual({ ok: true, path: "/learn/articles" });
  });

  it("refuses the home page and other people's sites", () => {
    expect(normalizePath("/", "arqr360.com").ok).toBe(false);
    expect(normalizePath("https://medium.com/blog", "arqr360.com").ok).toBe(false);
    expect(normalizePath("/blog?x=1", "arqr360.com").ok).toBe(false);
  });
});

describe("moving URLs to the owner's domain", () => {
  const base = "https://arqr360.com/blog";

  it("maps Genie Page URLs and leaves everything else alone", () => {
    expect(toOwnUrl("https://genie.app/p/arqr360.com/ar-sofa", "arqr360.com", base)).toBe("https://arqr360.com/blog/ar-sofa");
    expect(toOwnUrl("https://genie.app/p/arqr360.com", "arqr360.com", base)).toBe(base);
    expect(toOwnUrl("https://genie.app/p/other.com/x", "arqr360.com", base)).toBe("https://genie.app/p/other.com/x");
    expect(toOwnUrl("https://genie.app/p/arqr360.com/x", "arqr360.com", null)).toBe("https://genie.app/p/arqr360.com/x");
  });

  it("rewrites internal links inside an article, absolute and relative", () => {
    const html = '<a href="https://genie.app/p/arqr360.com/one">1</a> <a href="/p/arqr360.com/two">2</a> <a href="https://genie.app/go?a=1">buy</a>';
    const out = rewriteBodyLinks(html, "arqr360.com", base);
    expect(out).toContain('href="https://arqr360.com/blog/one"');
    expect(out).toContain('href="https://arqr360.com/blog/two"');
    expect(out).toContain('href="https://genie.app/go?a=1"'); // click tracking stays on Genie
  });

  it("builds article URLs and the IndexNow key inside the folder", () => {
    expect(ownArticleUrl(base + "/", "x")).toBe("https://arqr360.com/blog/x");
    expect(indexNowOptsFor(base)).toEqual({ keyLocation: "https://arqr360.com/blog/indexnow-key.txt" });
    expect(indexNowOptsFor(null)).toEqual({});
  });
});

describe("the rule for each host", () => {
  it("points every snippet at this business's Genie source", () => {
    const snips = rewriteSnippets({ path: "/blog", handle: "arqr360.com" });
    expect(snips.map((s) => s.id)).toEqual(["nextjs", "vercel", "netlify", "cloudflare", "nginx", "apache"]);
    for (const s of snips) expect(s.code).toContain("https://genie.app/b/arqr360.com");
    const vercel = JSON.parse(snips.find((s) => s.id === "vercel").code);
    expect(vercel.rewrites).toEqual([
      { source: "/blog", destination: "https://genie.app/b/arqr360.com" },
      { source: "/blog/:path*", destination: "https://genie.app/b/arqr360.com/:path*" },
    ]);
  });

  it("guesses the host from response headers", () => {
    expect(guessHosting({ "X-Powered-By": "Next.js", Server: "Vercel" })).toBe("nextjs");
    expect(guessHosting({ Server: "Vercel" })).toBe("vercel");
    expect(guessHosting({ server: "Netlify" })).toBe("netlify");
    expect(guessHosting({ "cf-ray": "abc" })).toBe("cloudflare");
    expect(guessHosting({})).toBe(null);
  });
});

describe("verification marker", () => {
  it("passes only for the account that set it up", () => {
    const mine = markerValue("arqr360.com", "user-a");
    const html = `<head><meta name="genie-blog" content="${mine}"></head>`;
    expect(hasMarker(html, mine)).toBe(true);
    expect(hasMarker(html, markerValue("arqr360.com", "user-b"))).toBe(false);
    expect(hasMarker("<head></head>", mine)).toBe(false);
  });
});
