// lib/pinpoint.js
// ── OPEN THE EXACT SPOT, NOT THE TOP OF THE PAGE ──
//
// Reported by the owner: a Reddit or Quora link opened the page, and finding the
// actual question — or the comment worth answering — meant scrolling and reading
// the whole thread. On a long thread that is most of the three minutes the whole
// morning is meant to take.
//
// Browsers support "text fragments": a link ending #:~:text=some%20words scrolls
// straight to those words on the page and highlights them (Chrome, Edge, Safari
// 16.1+, Firefox 131+). Every radar already saves the words it matched — the
// buyer's own sentence, or the post excerpt the search returned — so the link can
// carry them. Where the words are not found, or the browser is too old, the page
// simply opens as it did before: nothing about this can make a link worse.

const WORDS = 7;

// The distinctive start of a quote: no leading ellipsis, quote marks, or the
// "submitted by /u/…" boilerplate Reddit's feed appends.
function phrase(text) {
  const t = String(text || "")
    .replace(/submitted by\s+\/u\/[\s\S]*$/i, "")
    .replace(/\[(link|comments)\]/gi, " ")
    .replace(/^[\s"'“‘.…-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  // The first real sentence — search snippets often open with metadata like
  // "Answered 3y." — cut to a handful of words: a short phrase survives the
  // whitespace and markup differences a long one trips over.
  const sentences = t.split(/(?<=[.!?])\s/);
  const sentence = sentences.find((x) => x.trim().split(/\s+/).length >= 4) || "";
  return sentence.trim().split(/\s+/).slice(0, WORDS).join(" ").replace(/[\s,;:….-]+$/, "");
}

// Inside a text directive, "-", "&" and "," mean something, so all three are
// escaped; encodeURIComponent leaves "-" alone.
const enc = (s) => encodeURIComponent(s).replace(/-/g, "%2D");

/**
 * The link with the matched words attached, so it opens on them.
 * @param url     the page
 * @param quotes  the words to land on, best first — the buyer's own sentence,
 *                then the excerpt. Every one found is highlighted; the browser
 *                scrolls to the first that matches.
 */
export function pinpoint(url, ...quotes) {
  const u = String(url || "");
  if (!/^https?:\/\//i.test(u)) return url || null;
  const parts = [...new Set(quotes.map(phrase).filter((p) => p.split(" ").length >= 3))].slice(0, 2);
  if (!parts.length) return u;
  const base = u.includes("#") ? u : `${u}#`;
  return `${base}:~:${parts.map((p) => `text=${enc(p)}`).join("&")}`;
}
