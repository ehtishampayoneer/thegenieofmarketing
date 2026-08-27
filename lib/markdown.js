// lib/markdown.js
// Minimal, dependency-free markdown → HTML for publishing Genie articles.
// Covers what the Content Engine produces: headings, bold, italic, links,
// lists, and paragraphs.

// Replace em-dashes (and spaced en-dashes) with natural punctuation — the clearest
// "written by AI" tell in prose. Blanket-replacing every dash with a comma produced
// broken sentences in content that gets PUBLISHED for the client ("It worked — Then
// we scaled" became "It worked, Then we scaled"), so pick punctuation that fits the
// position: ranges keep a hyphen, an ended thought takes a full stop, an aside takes
// a comma.
export function deDash(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
    .replace(/\s*—\s+(?=[A-Z])/g, ". ")
    .replace(/\s+–\s+(?=[A-Z])/g, ". ")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+–\s+/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+([,.])/g, "$1");
}

export function markdownToHtml(md) {
  const lines = String(md || "").split("\n");
  const out = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }

    if (line.startsWith("### ")) { closeList(); out.push(`<h3>${inline(line.slice(4))}</h3>`); }
    else if (line.startsWith("## ")) { closeList(); out.push(`<h2>${inline(line.slice(3))}</h2>`); }
    else if (line.startsWith("# ")) { closeList(); out.push(`<h1>${inline(line.slice(2))}</h1>`); }
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

function inline(s) {
  return escapeHtml(s)
    // links: [text](url)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    // bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // italic
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── HTML → Markdown (the reverse) ──
// Powers the clean "markdown mirror" of each published page (served at /p/…/…/md).
// AI answer engines extract facts far more reliably from clean markdown than from a
// page wrapped in nav, styling and scripts. Tuned for the predictable HTML our own
// markdownToHtml emits, but tolerant of the richer HTML a WordPress import may carry.
export function htmlToMarkdown(html) {
  let s = String(html || "");

  // Drop media wrappers, keeping alt text as a caption where present.
  s = s.replace(/<figure[^>]*>([\s\S]*?)<\/figure>/gi, (m) => {
    const alt = (m.match(/alt="([^"]*)"/i) || [])[1];
    return alt ? `\n_${decode(alt)}_\n` : "\n";
  });
  s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (_m, a) => (a ? `![${decode(a)}]` : ""));
  s = s.replace(/<img[^>]*>/gi, "");
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Inline first, so links/emphasis inside headings and list items survive.
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, t) => `[${strip(t)}](${href})`);
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_m, _g, t) => `**${strip(t)}**`);
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_m, _g, t) => `*${strip(t)}*`);

  // Block level.
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t) => `\n\n# ${strip(t)}\n`);
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t) => `\n\n## ${strip(t)}\n`);
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t) => `\n\n### ${strip(t)}\n`);
  s = s.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_m, t) => `\n\n#### ${strip(t)}\n`);
  s = s.replace(/<\/li>\s+<li/gi, "</li><li"); // keep list items tight (no blank line between)
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => `\n- ${strip(t)}`);
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, t) => `\n> ${strip(t)}\n`);
  s = s.replace(/<\/p>/gi, "\n\n").replace(/<p[^>]*>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // Whatever tags remain are stripped; then decode entities and tidy whitespace.
  s = decode(s.replace(/<[^>]+>/g, ""));
  s = s.replace(/[ \t]+/g, " ").replace(/ *\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function strip(t) { return decode(String(t).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
function decode(s) {
  return String(s)
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—").replace(/&hellip;/g, "…");
}
