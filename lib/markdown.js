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
