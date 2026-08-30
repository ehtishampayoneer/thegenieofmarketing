// ── SITE AUDIT ──
// Server-side scan of the user's OWN website homepage (+ robots/sitemap) to detect the
// SEO/AEO foundations that help Genie rank them faster. Read-only: it only fetches public
// pages and reports what's present/missing — the page turns that into copy-paste fixes.
// It never edits the site.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normHost(h) {
  return String(h || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "");
}

async function fetchText(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal, redirect: "follow",
      // Next patches fetch and stores successful responses in the Data Cache.
      // Without this the first scan of a site is replayed for every scan after
      // it — a customer fixes their SEO, rescans, and is told nothing changed.
      // That is the one failure this tool cannot afford, so: never cached.
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketingGenie-SiteAudit/1.0; +https://thegenieofmarketing.vercel.app)", "Accept": "text/html,application/xhtml+xml" },
    });
    const text = r.ok ? await r.text() : "";
    return {
      ok: r.ok, status: r.status, text: text.slice(0, 600000), finalUrl: r.url,
      // how old the copy we read was, so staleness can never hide again
      age: Number(r.headers.get("age") || 0),
      edgeCache: r.headers.get("x-vercel-cache") || r.headers.get("cf-cache-status") || "",
    };
  } catch (e) {
    return { ok: false, status: 0, text: "", error: String(e?.name === "AbortError" ? "timeout" : e) };
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const host = normHost(searchParams.get("host") || searchParams.get("url"));
  if (!host || !/\./.test(host)) return Response.json({ ok: false, error: "Enter a valid website address." }, { status: 400 });

  const base = `https://${host}`;
  const home = await fetchText(base + "/");
  if (!home.ok && !home.text) {
    return Response.json({ ok: true, host, reachable: false, error: home.error || `status ${home.status}` });
  }

  const html = home.text || "";
  const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleM ? titleM[1].replace(/\s+/g, " ").trim() : "";
  const descM = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)
    || /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html);
  const desc = descM ? descM[1].replace(/\s+/g, " ").trim() : "";
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  const langM = /<html[^>]+lang=["']([^"']+)["']/i.exec(html);

  // JSON-LD structured-data @types
  const ldTypes = new Set();
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const walk = (o) => {
        if (!o || typeof o !== "object") return;
        const t = o["@type"]; if (t) (Array.isArray(t) ? t : [t]).forEach((x) => ldTypes.add(String(x)));
        if (Array.isArray(o["@graph"])) o["@graph"].forEach(walk);
      };
      (Array.isArray(j) ? j : [j]).forEach(walk);
    } catch {}
  }

  const [robots, sitemap] = await Promise.all([
    fetchText(base + "/robots.txt", 5000),
    fetchText(base + "/sitemap.xml", 5000),
  ]);

  return Response.json({
    ok: true, host, reachable: true,
    detected: {
      title, titleLen: title.length,
      desc, descLen: desc.length,
      h1Count,
      hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
      hasCanonical: /<link[^>]+rel=["']canonical["']/i.test(html),
      lang: langM ? langM[1] : "",
      hasOgTitle: /property=["']og:title["']/i.test(html),
      hasOgImage: /property=["']og:image["']/i.test(html),
      hasFavicon: /rel=["'][^"']*icon[^"']*["']/i.test(html),
      hasH2: /<h2[\s>]/i.test(html),
      ldTypes: [...ldTypes],
      hasRobots: robots.ok, hasSitemap: sitemap.ok || /sitemap/i.test(robots.text || ""),
      // schema types are matched case-insensitively by the report, but the raw
      // list is kept so a new badge can be checked without a server change
      hasService: ldTypes.has("Service") || ldTypes.has("Product") || ldTypes.has("Offer"),
    },
    // proof of what was read, for when a scan and a browser disagree
    fetchedAt: new Date().toISOString(),
    source: { bytes: html.length, finalUrl: home.finalUrl || base + "/", age: home.age || 0, edgeCache: home.edgeCache || "" },
  });
}
