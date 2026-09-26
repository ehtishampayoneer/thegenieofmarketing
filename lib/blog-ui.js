// lib/blog-ui.js
// ── WHAT THE OWNER'S BLOG IS MADE OF ──
// The lead story, the card grid, the thumbnails and the side rails, as functions
// rather than as template strings buried inside a route handler.
//
// WHY THEY LIVE HERE. A Next route file may only export its HTTP verbs, so
// anything defined inside one can be neither unit-tested nor previewed — and this
// is the surface an owner sends buyers to. Out here they are both. The route
// renders exactly what the tests render.
//
// WHAT THEY REPLACED. A single 720px column of blue links: no pictures, no sense
// of how much was there, and nothing to read next. An owner publishing every day
// looked at a page that made the work look like nothing.

import { fmtDate } from "@/app/p/reading";

export function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function attr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

/**
 * A card's picture.
 *
 * A page with no hero image is not a broken card: its initial on a warm wash reads
 * as a cover, costs no request, and never renders a missing-image icon on the one
 * page the owner sends people to.
 */
export function thumb(page, cls = "gp-thumb") {
  if (page?.hero_image) {
    return `<img class="${cls}" src="${attr(page.hero_image)}" alt="${attr(page.hero_alt || page.title)}" loading="lazy" decoding="async">`;
  }
  const initial = String(page?.title || "?").trim().charAt(0).toUpperCase() || "?";
  return `<div class="${cls} gp-thumb--none" aria-hidden="true">${esc(initial)}</div>`;
}

/** The newest article, big, because it is the one most readers will open. */
export function leadCard(page, href) {
  if (!page) return "";
  return `
      <div class="gp-lead"><a href="${attr(href)}">
        ${thumb(page)}
        <div class="gp-lead-in">
          ${page.target_keyword ? `<span class="gp-card-tag">${esc(page.target_keyword)}</span>` : ""}
          <span class="gp-lead-t">${esc(page.title)}</span>
          ${page.meta_description ? `<span class="gp-lead-d">${esc(page.meta_description)}</span>` : ""}
          <span class="gp-card-m">${esc(fmtDate(page.published_at))}</span>
        </div>
      </a></div>`;
}

/** @param hrefOf (page) => url — the route decides where its own links point. */
export function cardGrid(pages = [], hrefOf) {
  const rows = (pages || []).filter(Boolean);
  if (!rows.length) return "";
  const items = rows.map((p) => `
        <li class="gp-card"><a href="${attr(hrefOf(p))}">
          ${thumb(p)}
          <div class="gp-card-in">
            <span class="gp-card-t">${esc(p.title)}</span>
            ${p.meta_description ? `<span class="gp-card-d">${esc(p.meta_description)}</span>` : ""}
            <span class="gp-card-m">${esc(fmtDate(p.published_at))}</span>
          </div>
        </a></li>`).join("");
  return `<ul class="gp-cards">${items}</ul>`;
}

/**
 * A side rail.
 *
 * Only ever articles that exist. A rail padded out with something invented would
 * be the one part of this page that lies, on the page the owner sends buyers to —
 * so an empty rail says nothing, or says plainly that there is nothing yet.
 */
export function rail(kicker, pages = [], hrefOf, emptyNote = "") {
  const rows = (pages || []).filter(Boolean);
  if (!rows.length) {
    return emptyNote
      ? `<aside class="gp-rail"><p class="gp-rail-k">${esc(kicker)}</p><p class="gp-rail-empty">${esc(emptyNote)}</p></aside>`
      : `<aside class="gp-rail"></aside>`;
  }
  const items = rows.map((p) => `
        <li><a href="${attr(hrefOf(p))}">
          <span class="gp-rail-t">${esc(p.title)}</span>
          <span class="gp-rail-m">${esc(fmtDate(p.published_at))}</span>
        </a></li>`).join("");
  return `<aside class="gp-rail"><p class="gp-rail-k">${esc(kicker)}</p><ul class="gp-rail-list">${items}</ul></aside>`;
}

const wordsOf = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);

/**
 * Which other articles belong beside this one: the ones that share words with it,
 * then the newest. The same idea the internal linker uses, so a reader who followed
 * a link in the body finds the same neighbours in the rail.
 */
export function related(page, pages = [], limit = 5) {
  const words = new Set(wordsOf(`${page?.title || ""} ${page?.target_keyword || ""}`));
  return (pages || [])
    .filter((p) => p && p.slug !== page?.slug)
    .map((p) => ({ p, overlap: wordsOf(`${p.title} ${p.target_keyword || ""}`).filter((w) => words.has(w)).length }))
    .sort((a, b) => b.overlap - a.overlap || new Date(b.p.published_at || 0) - new Date(a.p.published_at || 0))
    .slice(0, Math.max(0, limit))
    .map((x) => x.p);
}

/**
 * The index: a lead story, a count, then the rest as cards, with a rail each side.
 * One function so the markup an owner sees is the markup the tests see.
 */
export function indexBody({ pages = [], name = "", topBar = "", hrefOf }) {
  const rows = (pages || []).filter(Boolean);
  const [lead, ...rest] = rows;
  const newest = rest.slice(0, 6);
  // The lead is already the biggest thing on the page; a rail repeating it beside
  // itself is the sort of padding that makes a thin blog look thinner.
  const oldest = [...rows].reverse().filter((p) => p.slug !== lead?.slug).slice(0, 6);
  const middle = rows.length
    ? `${leadCard(lead, hrefOf(lead))}<hr class="gp-rule"><p class="gp-count">${rows.length} article${rows.length === 1 ? "" : "s"} and counting.</p>${cardGrid(rest, hrefOf)}`
    : `<p class="gp-lede">New articles are on their way.</p>`;
  // The list comes first in the markup; the grid puts the rails either side of it.
  return `
    <div class="gp-shell">
      <div class="gp-main">
        ${topBar}
        <h1 class="gp-title">Articles &amp; guides</h1>
        <p class="gp-lede">Practical answers from ${esc(name)}.</p>
        ${middle}
      </div>
      ${rail("Latest", newest, hrefOf, "The newest articles will appear here.")}
      ${rail("Start here", oldest, hrefOf)}
    </div>`;
}
