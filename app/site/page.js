"use client";

// ── WEBSITE SETUP ──
// Genie scans the user's OWN website and hands back an exact, prioritised fix-list that
// makes the site rank-ready — titles, meta, structured-data "badges", discoverability and
// AEO. Every fix is copy-paste (a snippet the user or their dev pastes in). Genie never
// edits their site; it recommends, they apply. Read-only scan via /api/site-audit.

import { useEffect, useMemo, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { fetchLive } from "@/lib/live";

const cap = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const STATUS = {
  pass: { c: "var(--signal-live-ink)", bg: "var(--signal-live-soft)", label: "Good", icon: Icon.check },
  warn: { c: "var(--signal-warn)", bg: "var(--signal-warn-soft)", label: "Improve", icon: Icon.info },
  fix: { c: "var(--accent-ink)", bg: "var(--accent-quiet)", label: "Add this", icon: Icon.plus },
};

export default function SitePage() {
  const [biz, setBiz] = useState({ name: "", host: "" });
  const [keyword, setKeyword] = useState("");
  const [url, setUrl] = useState("");
  const [state, setState] = useState("idle"); // idle | scanning | done | error
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const t = await fetchLive("/api/today");
      const host = t.live && (t.data?.entity?.host || "");
      const name = t.live && (t.data?.entity?.name || t.data?.greetingName || "");
      if (host) { setBiz({ name: name || host, host }); setUrl(host); }
      else if (name) setBiz((b) => ({ ...b, name }));
      if (host) {
        const k = await fetchLive(`/api/keywords?host=${encodeURIComponent(host)}`);
        const first = k.live && (k.data?.graded || []).find((x) => x.keyword)?.keyword;
        if (first) setKeyword(first);
      }
    })();
  }, []);

  async function scan() {
    const h = url.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    if (!h || !/\./.test(h)) { setErr("Enter a valid website address, like yoursite.com"); return; }
    setState("scanning"); setErr(""); setRes(null);
    try {
      const j = await fetch(`/api/site-audit?host=${encodeURIComponent(h)}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) { setErr(j.error || "Couldn't scan that site. Check the address and try again."); setState("error"); return; }
      setRes(j); setState("done");
    } catch { setErr("Couldn't reach that site just now. Try again in a moment."); setState("error"); }
  }

  const base = res?.host ? `https://${res.host}` : "https://yoursite.com";
  const kw = keyword || "";
  const name = biz.name || res?.host || "Your business";
  const checks = useMemo(() => (res?.detected ? buildChecks(res.detected, { name, base, kw }) : []), [res, name, base, kw]);
  const groups = useMemo(() => groupBy(checks), [checks]);
  const score = useMemo(() => scoreOf(checks), [checks]);
  const fixes = checks.filter((c) => c.status !== "pass");

  return (
    <OperatorShell active="site">
      <OperatorHeader icon={Icon.globe} label="Website Setup" title="Make your site" accent="rank-ready."
        kicker="Genie scans your website and hands you the exact, copy-paste fixes that help it rank and get recommended by AI — faster. You (or your developer) paste them in; Genie never touches your site." />

      {/* scan bar */}
      <Card className="p-5 mt-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <label className="flex-1 min-w-0">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--fg)" }}>Your website address</span>
            <div className="mt-1.5 flex items-center gap-2 mg-field" style={{ paddingRight: 6 }}>
              <span className="text-[13.5px] shrink-0" style={{ color: "var(--fg-subtle)" }}>https://</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scan()} placeholder="yoursite.com"
                className="flex-1 min-w-0 bg-transparent outline-none text-[14px]" style={{ color: "var(--fg)", border: "none", padding: 0 }} />
            </div>
          </label>
          <button onClick={scan} disabled={state === "scanning"} className="mg-btn mg-btn--dawn shrink-0 disabled:opacity-50" style={{ fontSize: 14, height: 42 }}>
            {state === "scanning" ? <>Scanning… <span className="mg-thinking"><i /><i /><i /></span></> : <><Icon.scan size={15} /> Scan my site</>}
          </button>
        </div>
        {err && <p className="mt-2.5 text-[12.5px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}
        {res && !res.reachable && <p className="mt-2.5 text-[12.5px]" style={{ color: "var(--signal-warn)" }}>I couldn't load <b>{res.host}</b> (it may block bots or be offline). The checklist below still applies — use it as your setup guide.</p>}
      </Card>

      {state === "idle" && !res && (
        <IntroPreview />
      )}

      {state === "done" && res?.detected && (
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
          {/* MAIN — grouped checklist */}
          <div className="min-w-0 flex flex-col gap-5">
            {groups.map((g) => (
              <Card key={g.cat} className="p-0 overflow-hidden">
                <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                  <p className="mg-klabel">{g.cat}</p>
                  <span className="text-[12px] mg-num" style={{ color: "var(--fg-subtle)" }}>{g.items.filter((i) => i.status === "pass").length}/{g.items.length} ready</span>
                </div>
                <div>
                  {g.items.map((c, i) => <CheckRow key={c.id} c={c} first={i === 0} />)}
                </div>
              </Card>
            ))}
          </div>
          {/* RIGHT — score + priorities */}
          <div className="xl:sticky xl:top-4 flex flex-col gap-4">
            <Card className="p-6 flex flex-col items-center">
              <p className="mg-klabel self-start">Site readiness</p>
              <div className="mt-3"><Ring value={score.pct} /></div>
              <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--fg)" }}>{score.label}</p>
              <p className="text-[12.5px] text-center mt-1" style={{ color: "var(--fg-muted)" }}>{fixes.length === 0 ? "Your foundations are solid. Genie can rank you faster." : `${fixes.length} fix${fixes.length === 1 ? "" : "es"} to unlock faster ranking.`}</p>
            </Card>
            {fixes.length > 0 && (
              <Card className="p-5">
                <p className="mg-klabel mb-3">Do these first</p>
                <div className="flex flex-col">
                  {fixes.filter((f) => f.impact === "High").slice(0, 4).map((f, i) => (
                    <div key={f.id} className="flex items-center gap-2.5 py-2" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
                      <span className="shrink-0 flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: 7, background: STATUS[f.status].bg, color: STATUS[f.status].c }}>{(() => { const I = STATUS[f.status].icon; return <I size={12} />; })()}</span>
                      <span className="text-[13px]" style={{ color: "var(--fg)" }}>{f.label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 pt-3 text-[12px]" style={{ borderTop: "1px solid var(--hair)", color: "var(--fg-subtle)" }}>Paste the snippets into your site's <b>&lt;head&gt;</b> (or hand this page to your developer). Genie handles the content and links from its side.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </OperatorShell>
  );
}

// ── one check row: status, why, and a copy-paste snippet ──
function CheckRow({ c, first }) {
  const [open, setOpen] = useState(false);
  const S = STATUS[c.status];
  const Si = S.icon;
  return (
    <div style={{ borderTop: first ? "none" : "1px solid var(--hair)" }}>
      <button onClick={() => c.snippet && setOpen((v) => !v)} className={`w-full text-left flex items-start gap-3 px-5 py-3.5 mg-focus ${c.snippet ? "cursor-pointer" : "cursor-default"}`} style={{ background: "none", border: "none" }}>
        <span className="shrink-0 mt-0.5 flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 8, background: S.bg, color: S.c }}><Si size={14} /></span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>{c.label}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ padding: ".12rem .4rem", borderRadius: 5, background: S.bg, color: S.c }}>{S.label}</span>
            {c.impact === "High" && c.status !== "pass" && <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--accent-ink)" }}>· High impact</span>}
          </span>
          <span className="block text-[12.5px] mt-1 leading-snug" style={{ color: "var(--fg-muted)" }}>{c.why}</span>
          {c.detail && <span className="block text-[12px] mt-1 mg-num" style={{ color: "var(--fg-subtle)" }}>{c.detail}</span>}
        </span>
        {c.snippet && <Icon.chevronRight size={16} style={{ color: "var(--fg-subtle)", transform: open ? "rotate(90deg)" : "none", transition: "transform .2s", marginTop: 4 }} />}
      </button>
      {open && c.snippet && <div className="px-5 pb-4"><Snippet code={c.snippet} lang={c.lang} /></div>}
    </div>
  );
}

function Snippet({ code, lang = "html" }) {
  const [copied, setCopied] = useState(false);
  function copy() { try { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface-sunken)" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--hair)" }}>
        <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--fg-subtle)" }}>{lang === "json" ? "Paste before </head>" : "Paste into <head>"}</span>
        <button onClick={copy} className="mg-btn mg-btn--ghost mg-focus" style={{ fontSize: 11.5, padding: ".3rem .6rem" }}>{copied ? "Copied ✓" : "Copy"}</button>
      </div>
      <pre className="px-3.5 py-3 overflow-x-auto thin-scroll" style={{ margin: 0, fontFamily: "var(--font-mono, monospace)", fontSize: 12, lineHeight: 1.6, color: "var(--fg)", whiteSpace: "pre" }}>{code}</pre>
    </div>
  );
}

function Ring({ value, size = 132 }) {
  const stroke = 11, r = size / 2 - stroke - 2, c = 2 * Math.PI * r;
  const [off, setOff] = useState(c);
  useEffect(() => { const t = setTimeout(() => setOff(c - ((value ?? 0) / 100) * c), 150); return () => clearTimeout(t); }, [value, c]);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#siteGrad)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.1s var(--ease-out)" }} />
        <defs><linearGradient id="siteGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="var(--mg-royal-500)" /><stop offset="100%" stopColor="var(--signal-live)" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mg-num font-bold leading-none" style={{ fontSize: 38, letterSpacing: "-.03em", color: "var(--fg)" }}>{value}</span>
        <span className="mg-num text-[12px] font-semibold" style={{ color: "var(--fg-subtle)" }}>/100</span>
      </div>
    </div>
  );
}

function IntroPreview() {
  const items = [
    { icon: Icon.write, t: "Titles & meta", d: "The headline Google shows and AI reads." },
    { icon: Icon.check, t: "Structured-data badges", d: "Schema that wins rich results + AI citations." },
    { icon: Icon.search, t: "Discoverability", d: "Sitemap, robots, canonical — so pages get found." },
    { icon: Icon.spark, t: "AI-answer readiness", d: "FAQ + Open Graph so AI recommends you." },
  ];
  return (
    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((it, i) => (
        <Card key={i} className="p-5">
          <span className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 11, background: "var(--accent)", color: "var(--on-accent)" }}><it.icon size={19} /></span>
          <p className="mt-3 text-[14px] font-bold" style={{ color: "var(--fg)" }}>{it.t}</p>
          <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--fg-muted)" }}>{it.d}</p>
        </Card>
      ))}
    </div>
  );
}

// ── the audit logic: detected → prioritised, copy-paste checks ──
function buildChecks(d, { name, base, kw }) {
  const kwc = cap(kw || name);
  const list = [];
  const push = (o) => list.push(o);

  // Foundations
  push({
    id: "title", cat: "Foundations", impact: "High",
    status: !d.title ? "fix" : d.titleLen < 25 || d.titleLen > 62 ? "warn" : "pass",
    label: "Page title tag",
    why: "The clickable headline in Google and the first thing AI reads to understand your page. Lead with what you sell.",
    detail: d.title ? `Found: “${d.title}” (${d.titleLen} chars)` : "No <title> found.",
    snippet: `<title>${kwc}${kw && name && !name.toLowerCase().includes(String(kw).toLowerCase()) ? ` | ${name}` : ""}</title>`,
  });
  push({
    id: "desc", cat: "Foundations", impact: "High",
    status: !d.desc ? "fix" : d.descLen < 60 || d.descLen > 165 ? "warn" : "pass",
    label: "Meta description",
    why: "The summary under your Google result. A clear, benefit-led line lifts clicks (and gives AI a clean summary).",
    detail: d.desc ? `Found (${d.descLen} chars)` : "No meta description found.",
    snippet: `<meta name="description" content="${name} helps you with ${kw || "what you do"} — fast, done-for-you, and built to convert. See how it works.">`,
  });
  push({
    id: "h1", cat: "Foundations", impact: "Medium",
    status: d.h1Count === 1 ? "pass" : d.h1Count === 0 ? "fix" : "warn",
    label: "One clear H1 heading",
    why: "Each page should have exactly one H1 that states the main topic — it tells Google and AI what the page is about.",
    detail: `Found ${d.h1Count} H1 tag${d.h1Count === 1 ? "" : "s"}.`,
    snippet: d.h1Count === 1 ? null : `<h1>${kwc}</h1>`,
  });
  push({
    id: "viewport", cat: "Foundations", impact: "High",
    status: d.hasViewport ? "pass" : "fix",
    label: "Mobile viewport",
    why: "Google ranks the mobile version of your site first. Without this tag pages render broken on phones.",
    snippet: d.hasViewport ? null : `<meta name="viewport" content="width=device-width, initial-scale=1">`,
  });
  push({
    id: "lang", cat: "Foundations", impact: "Low",
    status: d.lang ? "pass" : "fix",
    label: "Page language",
    why: "Declares your language so search and screen-readers handle the page correctly.",
    snippet: d.lang ? null : `<html lang="en">`,
  });

  // Structured data (the "badges")
  const has = (t) => (d.ldTypes || []).some((x) => x.toLowerCase() === t.toLowerCase());
  push({
    id: "org", cat: "Structured-data badges", impact: "High",
    status: has("Organization") || has("LocalBusiness") ? "pass" : "fix",
    label: "Organization schema",
    why: "The badge that earns your logo + knowledge panel and tells AI who you are. High-impact for getting recommended.",
    lang: "json",
    snippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "${name}",
  "url": "${base}/",
  "logo": "${base}/logo.png"
}
</script>`,
  });
  push({
    id: "website", cat: "Structured-data badges", impact: "Medium",
    status: has("WebSite") ? "pass" : "fix",
    label: "WebSite schema",
    why: "Enables the sitelinks search box and helps engines map your site structure.",
    lang: "json",
    snippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "${name}",
  "url": "${base}/"
}
</script>`,
  });
  push({
    id: "faq", cat: "Structured-data badges", impact: "High",
    status: has("FAQPage") ? "pass" : "fix",
    label: "FAQ schema (AI answers)",
    why: "The single biggest lever for AI search: answer the questions buyers ask, marked up so ChatGPT/Gemini quote you.",
    lang: "json",
    snippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "What is the best ${kw || "option"} for me?",
    "acceptedAnswer": { "@type": "Answer", "text": "${name} — here's why: (2–3 sentences buyers actually search for)." }
  }, {
    "@type": "Question",
    "name": "How much does ${kw || "it"} cost?",
    "acceptedAnswer": { "@type": "Answer", "text": "Give a clear, honest price range here." }
  }]
}
</script>`,
  });

  push({
    id: "service", cat: "Structured-data badges", impact: "High",
    status: has("Service") || has("Product") || has("Offer") ? "pass" : "fix",
    label: "Pricing schema (what it costs)",
    why: "When somebody asks an assistant what you charge, this is what it reads. Prices in markup get quoted; prices only in a picture or a table do not.",
    lang: "json",
    snippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "What you sell",
  "provider": { "@type": "Organization", "name": "${name}" },
  "offers": [
    { "@type": "Offer", "name": "Your plan", "price": "30", "priceCurrency": "USD" }
  ]
}
</script>`,
  });

  // Discoverability
  push({
    id: "canonical", cat: "Discoverability", impact: "Medium",
    status: d.hasCanonical ? "pass" : "fix",
    label: "Canonical link",
    why: "Stops duplicate-URL versions from splitting your ranking strength.",
    snippet: d.hasCanonical ? null : `<link rel="canonical" href="${base}/">`,
  });
  push({
    id: "sitemap", cat: "Discoverability", impact: "High",
    status: d.hasSitemap ? "pass" : "fix",
    label: "XML sitemap",
    why: "The map that tells Google every page to index — new pages get found in days, not weeks.",
    detail: d.hasSitemap ? "Found at /sitemap.xml" : "Not found at /sitemap.xml.",
    snippet: d.hasSitemap ? null : `# Add /sitemap.xml (most site builders generate one),\n# then reference it in robots.txt:\nSitemap: ${base}/sitemap.xml`,
    lang: "text",
  });
  push({
    id: "robots", cat: "Discoverability", impact: "Medium",
    status: d.hasRobots ? "pass" : "fix",
    label: "robots.txt",
    why: "Guides crawlers and points them at your sitemap.",
    detail: d.hasRobots ? "Found at /robots.txt" : "Not found at /robots.txt.",
    snippet: d.hasRobots ? null : `# Save as /robots.txt\nUser-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml`,
    lang: "text",
  });
  push({
    id: "favicon", cat: "Discoverability", impact: "Low",
    status: d.hasFavicon ? "pass" : "fix",
    label: "Favicon",
    why: "Your little brand icon in the tab and in Google results — small trust signal.",
    snippet: d.hasFavicon ? null : `<link rel="icon" href="${base}/favicon.ico" sizes="any">`,
  });

  // Social & AEO
  push({
    id: "og", cat: "Social & AI answers", impact: "Medium",
    status: d.hasOgTitle && d.hasOgImage ? "pass" : "fix",
    label: "Open Graph (share + AI preview)",
    why: "Controls how your link looks when shared and previewed — a clean title + image gets more clicks and AI attention.",
    snippet: d.hasOgTitle && d.hasOgImage ? null : `<meta property="og:title" content="${kwc} | ${name}">
<meta property="og:description" content="${name} — ${kw || "what you do"}, done for you.">
<meta property="og:image" content="${base}/og-image.png">
<meta property="og:url" content="${base}/">
<meta property="og:type" content="website">`,
  });
  push({
    id: "depth", cat: "Social & AI answers", impact: "Medium",
    status: d.hasH2 ? "pass" : "warn",
    label: "Scannable subheadings",
    why: "Break pages into H2 sections buyers (and AI) can skim — depth and structure both help ranking.",
    snippet: null,
  });

  return list;
}

function groupBy(checks) {
  const order = ["Foundations", "Structured-data badges", "Discoverability", "Social & AI answers"];
  return order.map((cat) => ({ cat, items: checks.filter((c) => c.cat === cat) })).filter((g) => g.items.length);
}
function scoreOf(checks) {
  const w = { High: 3, Medium: 2, Low: 1 };
  let got = 0, total = 0;
  for (const c of checks) { const weight = w[c.impact] || 1; total += weight; got += weight * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0); }
  const pct = total ? Math.round((got / total) * 100) : 0;
  const label = pct >= 85 ? "Rank-ready" : pct >= 65 ? "Solid" : pct >= 40 ? "Getting there" : "Needs setup";
  return { pct, label };
}
