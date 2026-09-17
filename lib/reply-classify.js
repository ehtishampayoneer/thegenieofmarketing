// lib/reply-classify.js
// ── LABEL AN EMAIL REPLY WITHOUT SENDING IT ANYWHERE ──
// Reply previews come from the owner's Gmail, which makes them Google user data
// under Google's Limited Use rules: they may not be passed to a third party that
// could train on them. They used to go to the free AI tiers for classification,
// and free tiers reserve the right to train on prompts. So replies are labelled
// here, in plain code, and never leave Genie.
//
// Rules are enough for this job. The labels are coarse, the replies are short, and
// the phrases people use to say "not interested" or "I'm out of office" are very
// repetitive. Order matters: the most decisive signals are checked first.

const RULES = [
  ["auto", /\b(out of (the )?office|auto(matic)?[- ]?reply|on (annual |parental )?leave|away from (my )?(desk|email)|limited access to (my )?email|will (be back|return) on|currently away|this is an automated)\b/i],
  ["unsubscribe", /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (email|contact)|don'?t (email|contact) me|opt[- ]?out|not interested,? (please )?remove)\b/i],
  ["wrong_person", /\b(wrong (person|contact)|not the right (person|contact)|no longer (work|with)|left the company|not (my|in my) (department|area|role)|you (should|could|might) (contact|reach|speak|talk to)|i'?m not (the|in charge)|forward(ed|ing)? (this|your email) to)\b/i],
  ["not_now", /\b(not (right )?now|not at (this|the moment)|maybe later|next (quarter|year|month)|circle back|reach out (again )?(later|in)|follow up (later|in)|too busy|no budget (right now|at the moment|this)|revisit)\b/i],
  ["objection", /\b(too expensive|can'?t afford|no budget|already (have|use|using|work with)|we'?re (happy|covered|set)|not (a )?(fit|priority|relevant)|don'?t need|no need|not interested|sounds (complicated|like a lot)|we tried)\b/i],
  ["interested", /\b(interested|sounds (good|great|interesting)|tell me more|let'?s (talk|chat|meet|do it|set up|book)|book a (call|demo|time)|send (me )?(more|details|info|pricing|a demo|the link)|happy to (chat|talk|hop)|when (are|would) you (free|available)|what'?s (the )?(price|cost|pricing)|how much|keen|love to|would like to (see|try|learn))\b/i],
  ["question", /\?/],
];

/** One of: interested, question, objection, not_now, wrong_person, unsubscribe, auto — or null. */
export function classifyReply(text = "") {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // Look at what they wrote, not the quoted original email below it.
  const own = t.split(/\bOn .{5,80} wrote:|-----Original Message-----|From: .{3,80} Sent:/i)[0];
  for (const [label, rx] of RULES) if (rx.test(own)) return label;
  return null;
}
