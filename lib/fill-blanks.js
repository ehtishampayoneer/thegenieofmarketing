// lib/fill-blanks.js
// ── NO EMAIL LEAVES WITH A BLANK IN IT ──
//
// A drafted email reached the owner reading "Hi [Decision-Maker Name]," and
// signing off "Best regards, [Your Name]". Models do this constantly — they are
// writing what looks like a template because templates are most of what they were
// trained on — and nothing in this codebase forbade it or noticed it afterwards.
//
// It is worse than an ugly draft. The whole promise is that Genie does the work
// and the owner presses approve, and a draft with two blanks in it hands the work
// straight back, on the one screen that exists to say the opposite. If one were
// ever approved without being read, it would reach a real company with the square
// brackets still in it.
//
// So: the prompts forbid it, and this catches whatever still gets through. Genie
// already knows every value it was guessing at. The recipient's name came with the
// contact. The sender's name and company are on the owner's profile. There was
// never anything for the owner to fill in.

// What a model writes when it does not know something: [Name], {{name}}, <Name>.
const BLANK = /(\[[^\]\n]{2,40}\]|\{\{[^}\n]{2,40}\}\}|<[A-Z][A-Za-z ._-]{2,38}>)/g;

// Each blank, matched by what it is asking for rather than by its exact wording,
// because every model words them differently.
const WANTS = [
  { id: "recipient", re: /^(decision[- ]?maker|recipient|contact|first ?name|their ?name|name|prospect|editor|owner|manager)$/i },
  { id: "sender", re: /^(your ?name|my ?name|sender|signature|sign[- ]?off|from)$/i },
  { id: "company", re: /^(your ?company|my ?company|company ?name|business ?name|brand)$/i },
  { id: "recipientCompany", re: /^(their ?company|company|business|store|shop|site|website|publication)$/i },
  { id: "role", re: /^(role|title|job ?title|position)$/i },
];

const clean = (t) => String(t || "").replace(/^[[<{\s]+|[\]>}\s]+$/g, "").replace(/\{\{|\}\}/g, "").trim();
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";

/** Every blank still left in a piece of text. Used to refuse, and to test. */
export function findBlanks(text) {
  return [...new Set(String(text || "").match(BLANK) || [])];
}

export function hasBlanks(text) {
  return findBlanks(text).length > 0;
}

/**
 * Fill what Genie knows and remove what it does not, so no blank survives.
 *
 * Unknown blanks are not left in and not replaced with something invented. A
 * greeting loses the name — "Hi there," is a normal way to open an email and a
 * wrong name is not. A sign-off falls back to the business, which is true. Anything
 * else is dropped along with the sentence's now-dangling punctuation.
 *
 * @returns { text, filled: [{ blank, with }], removed: [blank] }
 */
export function fillBlanks(text, who = {}) {
  let out = String(text || "");
  if (!out) return { text: out, filled: [], removed: [] };

  const values = {
    recipient: firstName(who.recipientName),
    sender: String(who.senderName || who.companyName || "").trim(),
    company: String(who.companyName || who.senderName || "").trim(),
    recipientCompany: String(who.recipientCompany || "").trim(),
    role: "",
  };

  const filled = [], removed = [];
  out = out.replace(BLANK, (match) => {
    const asked = clean(match).toLowerCase();
    const want = WANTS.find((w) => w.re.test(asked));
    const value = want ? values[want.id] : "";
    if (value) { filled.push({ blank: match, with: value }); return value; }
    removed.push(match);
    return "\u0000"; // marked, then swept below with the punctuation around it
  });

  if (removed.length) {
    out = out
      // "Hi \0," / "Hello \0!" → a greeting that reads as one.
      .replace(/\b(hi|hello|hey|dear)[ \t]+\u0000\s*([,!.]?)/gi, (_m, g, p) => `${g} there${p || ","}`)
      // "Best regards,\n\0" → drop the orphaned line entirely.
      .replace(/[ \t]*\n[ \t]*\u0000[ \t]*(?=\n|$)/g, "")
      // Anything else: remove it and tidy the space and punctuation it leaves.
      .replace(/[ \t]*\u0000[ \t]*/g, " ")
      .replace(/ +([,.!?;:])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return { text: out, filled, removed };
}

/** The rule handed to every model that writes a message someone will receive. */
export const NO_BLANKS_RULE = `NEVER leave a blank for someone else to fill. No [Name], no [Your Company], no
{{placeholder}}, no <Role>, in the subject or the body. This message is sent exactly
as you write it, so anything in brackets arrives in a stranger's inbox with the
brackets still in it. If you do not know the person's name, open with "Hi there,"
rather than inventing one or leaving a gap. Sign off with the sender's real name,
which you were given above. If a fact is missing, write a sentence that does not
need it.`;
