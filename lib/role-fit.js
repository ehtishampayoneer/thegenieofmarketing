// lib/role-fit.js
// ── IS THIS THE RIGHT PERSON TO SEND THIS TO? ──
//
// An address is not just a way to reach a company, it is a statement about whose
// job it is. Writing about an AR product viewer to careers@ is not a marginally
// worse email — it is the wrong message to the wrong function, and the person who
// opens it is the one hiring, not the one buying.
//
// It matters in three ways at once.
//
// It works better. A message that lands with the person whose job it actually
// touches gets read; one that lands with payroll gets deleted, and if it gets
// deleted often enough it teaches the mailbox provider what to do with the rest.
//
// It is the law in places worth selling to. Canada allows a cold message to an
// address the recipient conspicuously published, with no notice refusing such
// mail, PROVIDED the message is relevant to their role or function. The first two
// conditions are already enforced by lib/contact-source.js. This is the third,
// and it is what makes Canada something the owner can switch on.
//
// TWO TIERS, ON PURPOSE.
//
//   Never    — noreply@, abuse@, legal@, careers@ and their kind. Nobody should
//              ever receive commercial outreach there, whatever it is about, so
//              these are refused at the send itself.
//   Wrong-for-this — press@ is exactly right for a "would you feature us" pitch
//              and wrong for a product pitch; sales@ is the reverse. These depend
//              on what is being sent, so they filter at selection rather than
//              being blocked outright.

const LOCAL = (email) => String(email || "").toLowerCase().split("@")[0].replace(/[._-]/g, "");

// Nobody should get commercial mail here, for any reason.
const NEVER = {
  noreply: ["noreply", "nonreply", "donotreply", "no"],
  automated: ["postmaster", "mailerdaemon", "bounce", "bounces", "webmaster", "hostmaster"],
  abuse: ["abuse", "security", "phishing", "spam"],
  privacy: ["privacy", "dpo", "gdpr", "dataprotection", "compliance"],
  legal: ["legal", "counsel", "trademark", "copyright"],
  optout: ["unsubscribe", "optout", "remove"],
  hiring: ["careers", "career", "jobs", "job", "recruitment", "recruiting", "hr", "humanresources", "hiring", "apply", "cv", "resumes"],
};

// Right for one kind of message and wrong for another.
const FUNCTIONS = {
  press: ["press", "media", "pr", "editor", "editorial", "news", "tips", "newsdesk", "journalist"],
  money: ["billing", "accounts", "accounting", "invoices", "invoice", "finance", "payments", "creditcontrol"],
  aftersales: ["returns", "complaints", "warranty", "claims"],
  support: ["support", "help", "helpdesk", "service", "customerservice", "care"],
  commercial: ["sales", "partnerships", "partner", "partners", "bd", "business", "wholesale", "trade", "reseller", "newbusiness", "enquiries", "enquiry", "inquiries"],
  general: ["info", "hello", "hi", "contact", "contactus", "office", "team", "mail", "admin", "general", "shop", "store"],
};

const bucketOf = (local) => {
  for (const [name, list] of Object.entries(NEVER)) if (list.includes(local)) return { bucket: name, never: true };
  for (const [name, list] of Object.entries(FUNCTIONS)) if (list.includes(local)) return { bucket: name, never: false };
  // Not a named mailbox we recognise. Most of these are a person — first names,
  // initials, firstname.lastname — and a named address at a small company is
  // usually the person who decides.
  return { bucket: "named", never: false };
};

/** What job does this address belong to? Never throws, always answers. */
export function roleOfAddress(email) {
  const local = LOCAL(email);
  if (!local) return { bucket: "unknown", never: false };
  return bucketOf(local);
}

// Which buckets suit which kind of message. `offer` is a product or partnership
// pitch; `media` is asking to be written about or listed.
const SUITS = {
  offer: ["commercial", "general", "named", "support"],
  media: ["press", "general", "named", "commercial"],
};

/**
 * May Genie send THIS kind of message to THIS address?
 *
 * @param {string} email
 * @param {object} opts
 * @param {"offer"|"media"} [opts.purpose="offer"]
 * @param {string[]} [opts.roles]  the jobs the plan says this offer is relevant to
 * @param {string} [opts.title]    the contact's own title, when the site gave one
 * @returns {{ok, hard, bucket, reason}}  hard:true means refuse everywhere
 */
export function roleFit(email, { purpose = "offer", roles = [], title = "" } = {}) {
  const { bucket, never } = roleOfAddress(email);

  if (never) {
    return {
      ok: false, hard: true, bucket,
      reason: `${email} is a ${bucket} address. Nobody should receive commercial outreach there, whatever it is about — and in several countries a message has to be relevant to the recipient's role to be lawful at all.`,
    };
  }

  const suits = SUITS[purpose] || SUITS.offer;
  if (!suits.includes(bucket)) {
    return {
      ok: false, hard: false, bucket,
      reason: purpose === "offer"
        ? `${email} is the ${bucket} desk, which is not whose job this offer touches. Genie looks for a better address at the same company rather than sending here.`
        : `${email} is the ${bucket} desk, which is not who decides what gets written about.`,
    };
  }

  // A stated title beats a guess from the mailbox name. Only used to CONFIRM, never
  // to reject: plenty of right people have titles the plan never thought to list.
  if (title && roles?.length) {
    const t = String(title).toLowerCase();
    const matched = roles.find((r) => t.includes(String(r).toLowerCase().split(/\s+/)[0]));
    if (matched) return { ok: true, hard: false, bucket, reason: `Their title matches "${matched}", which is who this is for.` };
  }

  return { ok: true, hard: false, bucket, reason: "" };
}

/** Best address first: a person, then a commercial desk, then a general one. */
export function rankByRole(emails = [], opts = {}) {
  const order = { named: 0, commercial: 1, general: 2, support: 3 };
  return [...(emails || [])]
    .filter((e) => roleFit(e?.email || e, opts).ok)
    .sort((a, b) => {
      const ra = order[roleOfAddress(a?.email || a).bucket] ?? 9;
      const rb = order[roleOfAddress(b?.email || b).bucket] ?? 9;
      return ra - rb;
    });
}
