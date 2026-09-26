// app/p/reading.js
// ── THE PUBLIC READING SURFACE ──
// One stylesheet for every page Genie publishes for an owner: the React Genie
// Pages at /p/* and the owner's own hosted blog at /b/*. Shared on purpose — two
// stylesheets is how one of them quietly becomes the old design nobody updated.
//
// WHAT WAS WRONG WITH IT. It was a single 720px column of blue links on white: an
// article list with no pictures, no sense of how much was there, and nothing to
// read next. An owner who publishes every day looked at a page that made the work
// look like nothing. "Too boring" was the exact word, and it was fair.
//
// SO: warm paper with a fine surveyor's grid behind it, real thumbnails, a lead
// story that looks like one, and side rails carrying the rest so there is always
// something to read next. The reading column itself is unchanged at 720px, because
// the one thing this page is for is reading.
//
// The palette lives in ONE block at the top so a per-site theme can replace it
// without touching the layout. It is a default, not an assumption about what any
// business sells.

export const READING_CSS = `
.gp{
  /* ── the theme. one block, overridable. ── */
  --page:#FAF7F2;          /* warm paper, not screen white */
  --bg:#FAF7F2;
  --ink:#191919;
  --muted:#5A554E;
  --subtle:#6E6A64;
  --line:#E4DED4;
  --card:#F2EEE7;
  --accent:#E0682A;        /* terracotta: links, rules, the lead story's edge */
  --accent-ink:#B4501C;    /* the same colour at text contrast */
  --accent2:#B07A3C;
  --grid:rgba(120,90,55,.055);
  --shadow:0 18px 40px -26px rgba(60,40,20,.5);
  --f-head:"Archivo","Segoe UI",-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;
  --f-body:"Inter","Segoe UI",-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;

  min-height:100vh;color:var(--ink);background-color:var(--page);
  /* The scan grid, as a background rather than a layer of empty divs. 46px is the
     same pitch the brand's own mesh uses, so the two pages feel like one site. */
  background-image:
    repeating-linear-gradient(90deg,var(--grid) 0 1px,transparent 1px 46px),
    repeating-linear-gradient(0deg,var(--grid) 0 1px,transparent 1px 46px);
  font-family:var(--f-body);-webkit-font-smoothing:antialiased;
}
.gp *{box-sizing:border-box}
.gp img{display:block;max-width:100%}

/* ── the reading column, and the three-column shell the rails live in ── */
.gp-wrap{max-width:720px;margin:0 auto;padding:clamp(28px,6vw,64px) 22px 24px;}
.gp-shell{max-width:1360px;margin:0 auto;padding:clamp(24px,5vw,56px) 22px 24px;
  display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(24px,3vw,44px);}
/* The article comes FIRST in the markup, and the grid puts the rails either side
   of it on a wide screen. Rails-first markup with a CSS reorder would leave a
   phone reader — and a screen reader, and a crawler — meeting a list of other
   articles before the title of the one they asked for. */
.gp-shell>.gp-main{min-width:0;max-width:760px;margin:0 auto;width:100%;}
/* Rails appear only where there is genuinely room for them. Below that they fall
   in under the article, which is where a phone reader wants them anyway. */
@media (min-width:1180px){
  .gp-shell{grid-template-columns:minmax(200px,248px) minmax(0,1fr) minmax(200px,248px);align-items:start;}
  .gp-shell>.gp-main{grid-column:2;grid-row:1;margin:0;}
  .gp-shell>.gp-rail:first-of-type{grid-column:1;grid-row:1;}
  .gp-shell>.gp-rail:last-of-type{grid-column:3;grid-row:1;}
  .gp-rail{position:sticky;top:24px;}
}
.gp-rail{min-width:0;}
.gp-rail-k{font-family:var(--f-head);font-size:11px;font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:var(--accent-ink);padding-bottom:9px;border-bottom:1px solid var(--line);}
.gp-rail-list{list-style:none;margin:0;padding:0;}
.gp-rail-list li{border-bottom:1px solid var(--line);}
.gp-rail-list a{display:block;padding:13px 0;text-decoration:none;}
.gp-rail-t{display:block;font-size:14px;font-weight:600;line-height:1.35;color:var(--ink);}
.gp-rail-list a:hover .gp-rail-t{color:var(--accent-ink);}
.gp-rail-m{display:block;margin-top:5px;font-size:12px;color:var(--subtle);font-variant-numeric:tabular-nums;}
.gp-rail-empty{margin:12px 0 0;font-size:13px;color:var(--subtle);line-height:1.5;}

/* ── headings and body ── */
.gp-eyebrow{font-size:13px;font-weight:600;color:var(--subtle);letter-spacing:.01em;margin-bottom:14px;}
.gp-eyebrow a{color:var(--accent-ink);text-decoration:none;font-weight:700;}
.gp-eyebrow a:hover{text-decoration:underline;}
.gp-title{font-family:var(--f-head);font-size:clamp(30px,5vw,46px);line-height:1.06;
  letter-spacing:-.022em;font-weight:800;text-wrap:balance;margin:0;}
.gp-lede{margin-top:14px;font-size:19px;line-height:1.5;color:var(--muted);}
.gp-hero{width:100%;height:auto;border-radius:16px;margin-top:26px;display:block;
  border:1px solid var(--line);box-shadow:var(--shadow);}
.gp-body{margin-top:30px;font-size:18px;line-height:1.72;color:var(--ink);}
.gp-body>*+*{margin-top:1.15em;}
.gp-body h2{font-family:var(--f-head);font-size:26px;line-height:1.22;letter-spacing:-.015em;font-weight:700;margin-top:1.9em;color:var(--ink);}
.gp-body h3{font-family:var(--f-head);font-size:20px;line-height:1.3;font-weight:700;margin-top:1.5em;color:var(--ink);}
.gp-body ul{padding-left:1.3em;}.gp-body li{margin-top:.5em;}
.gp-body a{color:var(--accent-ink);text-underline-offset:2px;}
.gp-body strong{font-weight:700;color:var(--ink);}
.gp-body blockquote{margin-left:0;padding:2px 0 2px 18px;border-left:3px solid var(--accent);color:var(--muted);}
.gp-body img{border-radius:14px;border:1px solid var(--line);}

/* ── the index: a lead story, then a grid of cards with real thumbnails ── */
.gp-cards{list-style:none;margin:26px 0 0;padding:0;display:grid;gap:clamp(16px,2vw,26px);
  grid-template-columns:repeat(auto-fill,minmax(248px,1fr));}
.gp-card{margin:0;}
.gp-card>a{display:flex;flex-direction:column;height:100%;text-decoration:none;
  background:#FFFDFA;border:1px solid var(--line);border-radius:18px;overflow:hidden;
  transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;}
.gp-card>a:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:var(--accent);}
.gp-thumb{width:100%;aspect-ratio:16/9;object-fit:cover;background:var(--card);border:0;border-radius:0;}
/* No photo yet is not a broken card: the initial on a warm wash reads as a cover. */
.gp-thumb--none{display:flex;align-items:center;justify-content:center;
  font-family:var(--f-head);font-size:38px;font-weight:800;color:#FFFFFF;
  background:linear-gradient(135deg,var(--accent),var(--accent2));letter-spacing:-.02em;}
.gp-card-in{padding:16px 17px 18px;display:flex;flex-direction:column;gap:7px;flex:1;}
.gp-card-t{font-family:var(--f-head);font-size:17px;font-weight:700;line-height:1.28;letter-spacing:-.012em;color:var(--ink);}
.gp-card-d{font-size:14px;line-height:1.5;color:var(--muted);}
.gp-card-m{margin-top:auto;font-size:12px;color:var(--subtle);font-variant-numeric:tabular-nums;}
.gp-card-tag{align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--accent-ink);}

.gp-lead{margin:26px 0 0;}
.gp-lead>a{display:grid;grid-template-columns:minmax(0,1fr);text-decoration:none;
  background:#FFFDFA;border:1px solid var(--line);border-radius:20px;overflow:hidden;
  transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;}
.gp-lead>a:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:var(--accent);}
@media (min-width:760px){ .gp-lead>a{grid-template-columns:1.25fr 1fr;align-items:stretch;} }
.gp-lead .gp-thumb{height:100%;aspect-ratio:16/10;}
.gp-lead-in{padding:clamp(18px,2.4vw,30px);display:flex;flex-direction:column;gap:10px;justify-content:center;}
.gp-lead-t{font-family:var(--f-head);font-size:clamp(21px,2.5vw,27px);font-weight:800;line-height:1.16;letter-spacing:-.018em;color:var(--ink);}
.gp-lead-d{font-size:15px;line-height:1.55;color:var(--muted);}

.gp-rule{margin:34px 0 0;height:1px;background:var(--line);border:0;}
.gp-count{margin-top:10px;font-size:13px;color:var(--subtle);}

/* ── the calls to action ── */
.gp-cta{margin-top:44px;padding:24px;border-radius:16px;background:var(--card);border:1px solid var(--line);}
.gp-cta-k{font-family:var(--f-head);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--accent-ink);}
.gp-cta-t{margin-top:6px;font-size:17px;color:var(--ink);}
.gp-cta-b{display:inline-block;margin-top:14px;padding:11px 18px;border-radius:100px;background:var(--accent);
  color:#FFFFFF;font-weight:600;font-size:15px;text-decoration:none;box-shadow:0 14px 30px -14px rgba(224,104,42,.8);}
.gp-cta-b:hover{background:#C9571E;}
.gp-sub{margin-top:40px;padding:26px 24px;border-radius:18px;background:var(--card);border:1px solid var(--line);}
.gp-sub-k{font-family:var(--f-head);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--accent2);}
.gp-sub-t{margin-top:7px;font-family:var(--f-head);font-size:21px;font-weight:700;letter-spacing:-.01em;color:var(--ink);}
.gp-sub-s{margin-top:5px;font-size:15px;color:var(--muted);}
.gp-sub-row{margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;}
.gp-sub-in{flex:1;min-width:200px;padding:12px 14px;border-radius:11px;border:1px solid var(--line);background:#FFFDFA;color:var(--ink);font-size:15px;font-family:inherit;}
.gp-sub-in:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(224,104,42,.16);}
.gp-sub-b{padding:12px 20px;border-radius:100px;border:none;background:var(--accent);color:#FFFFFF;font-weight:600;font-size:15px;cursor:pointer;}
.gp-sub-b:hover{background:#C9571E;}
.gp-sub-b:disabled{opacity:.6;cursor:default;}
.gp-sub-err{margin-top:9px;font-size:13px;color:#C7291E;}
.gp-sub--done{border-color:var(--accent2);background:linear-gradient(135deg,rgba(176,122,60,.1),transparent);}

/* ── the old flat list. Kept working for anything still rendering it. ── */
.gp-list{margin-top:26px;list-style:none;padding:0;display:flex;flex-direction:column;gap:2px;}
.gp-list a{display:block;padding:18px 16px;border-radius:14px;text-decoration:none;transition:background .15s;border:1px solid transparent;}
.gp-list a:hover{background:var(--card);border-color:var(--line);}
.gp-li-t{display:block;font-family:var(--f-head);font-size:18px;font-weight:700;color:var(--ink);letter-spacing:-.01em;}
.gp-li-d{display:block;margin-top:5px;font-size:15px;color:var(--muted);line-height:1.5;}
.gp-li-m{display:block;margin-top:8px;font-size:13px;color:var(--subtle);font-variant-numeric:tabular-nums;}

.gp-foot{max-width:1360px;margin:16px auto 0;padding:22px;border-top:1px solid var(--line);text-align:center;}
.gp-foot a{font-size:13px;color:var(--subtle);text-decoration:none;}
.gp-foot a:hover{color:var(--accent-ink);}

/* Warm dark rather than black, so the paper still reads as paper at night. */
@media (prefers-color-scheme:dark){
  .gp{--page:#15120E;--bg:#15120E;--ink:#F4F0EA;--muted:#BDB6AC;--subtle:#989186;--line:#332D25;
    --card:#1F1A14;--accent:#F0803C;--accent-ink:#F0803C;--accent2:#CE9A5A;
    --grid:rgba(240,128,60,.05);--shadow:0 18px 40px -26px rgba(0,0,0,.8);}
  .gp-card>a,.gp-lead>a,.gp-sub-in{background:#1B1610;}
  .gp-thumb{background:#231D16;}
  .gp-body img,.gp-hero{border-color:var(--line);}
}
@media print{ .gp{background-image:none;} .gp-rail,.gp-sub{display:none;} }
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
