// app/p/reading.js
// Shared reading-layout CSS + tiny helpers for the public Genie Pages (/p/*).
// A calm, fast, indexable article surface — the content is the product here, so
// the design gets out of the way. Light by default, gracefully dark-aware.
// (Not a route file — Next only routes page/route/layout, so this is importable.)

export const READING_CSS = `
.gp{--ink:#12151b;--muted:#55606c;--subtle:#8a96a2;--bg:#fbfbf9;--card:#ffffff;--line:#e9e9e2;--accent:#b5701a;--accent2:#1e9e6a;
  min-height:100vh;background:var(--bg);color:var(--ink);
  font-family:"Geist","Inter",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;}
.gp-wrap{max-width:720px;margin:0 auto;padding:clamp(28px,6vw,64px) 22px 24px;}
.gp-eyebrow{font-size:13px;font-weight:600;color:var(--subtle);letter-spacing:.01em;margin-bottom:14px;}
.gp-eyebrow a{color:var(--accent);text-decoration:none;font-weight:700;}
.gp-eyebrow a:hover{text-decoration:underline;}
.gp-title{font-size:clamp(28px,5vw,44px);line-height:1.1;letter-spacing:-.022em;font-weight:800;text-wrap:balance;}
.gp-lede{margin-top:14px;font-size:19px;line-height:1.5;color:var(--muted);}
.gp-hero{width:100%;height:auto;border-radius:14px;margin-top:26px;display:block;border:1px solid var(--line);}
.gp-body{margin-top:30px;font-size:18px;line-height:1.72;color:#232a33;}
.gp-body>*+*{margin-top:1.15em;}
.gp-body h2{font-size:25px;line-height:1.25;letter-spacing:-.015em;font-weight:750;margin-top:1.9em;color:var(--ink);}
.gp-body h3{font-size:20px;line-height:1.3;font-weight:700;margin-top:1.5em;color:var(--ink);}
.gp-body ul{padding-left:1.3em;}.gp-body li{margin-top:.5em;}
.gp-body a{color:var(--accent);text-underline-offset:2px;}
.gp-body strong{font-weight:700;color:var(--ink);}
.gp-cta{margin-top:44px;padding:24px;border-radius:16px;background:linear-gradient(135deg,#fff6ea,#fdfaf3);border:1px solid #f0e2c9;}
.gp-cta-k{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--accent);}
.gp-cta-t{margin-top:6px;font-size:17px;color:var(--ink);}
.gp-cta-b{display:inline-block;margin-top:14px;padding:11px 18px;border-radius:11px;background:linear-gradient(135deg,#fbb360,#f59e3d);
  color:#2c1b05;font-weight:700;font-size:14.5px;text-decoration:none;box-shadow:0 6px 22px rgba(245,158,61,.22);}
.gp-list{margin-top:26px;list-style:none;padding:0;display:flex;flex-direction:column;gap:2px;}
.gp-list a{display:block;padding:18px 16px;border-radius:14px;text-decoration:none;transition:background .15s;border:1px solid transparent;}
.gp-list a:hover{background:var(--card);border-color:var(--line);}
.gp-li-t{display:block;font-size:18px;font-weight:700;color:var(--ink);letter-spacing:-.01em;}
.gp-li-d{display:block;margin-top:5px;font-size:14.5px;color:var(--muted);line-height:1.5;}
.gp-li-m{display:block;margin-top:8px;font-size:12.5px;color:var(--subtle);font-variant-numeric:tabular-nums;}
.gp-foot{max-width:720px;margin:16px auto 0;padding:22px;border-top:1px solid var(--line);text-align:center;}
.gp-foot a{font-size:13px;color:var(--subtle);text-decoration:none;}
.gp-foot a:hover{color:var(--accent);}
@media (prefers-color-scheme:dark){
  .gp{--ink:#eef2f6;--muted:#aab4bf;--subtle:#7d8894;--bg:#0c0f14;--card:#151a21;--line:#242b34;--accent:#ffc876;--accent2:#3fd79a;}
  .gp-body{color:#d7dee6;}
  .gp-cta{background:linear-gradient(135deg,rgba(255,200,118,.10),rgba(255,200,118,.03));border-color:rgba(255,200,118,.22);}
  .gp-cta-b{background:linear-gradient(135deg,#ffd79e,#f59e3d);}
  .gp-hero{border-color:var(--line);}
}
`;

export function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return ""; }
}
export function ensureHttp(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
