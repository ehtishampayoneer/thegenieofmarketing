// lib/page-guides.js
// ── "HOW THIS PAGE WORKS" GUIDES ──
// Plain-language, visual explanations shown in the PageGuide modal (the info button in
// the shell header). Keyed by the OperatorShell `active` id of each page. Each guide
// has TWO parts a layman needs: `use` = the concrete steps you take ON this page (what
// to click / type — the thing people were missing), and `steps` = what Genie then does
// behind the scenes. Plus who-does-what and why it makes money. Add a key here and every
// page with that `active` id gets a guide automatically.

export const PAGE_GUIDES = {
  today: {
    name: "Today", icon: "home",
    what: "Your morning briefing — what Genie did overnight, and the few things that need a yes from you.",
    use: [
      "Read the summary at the top — Genie tells you what it got done while you slept.",
      "Click the big “Review approvals” button to see everything it wrote.",
      "Approve each item (or tweak first). That's your whole daily job — about 5 minutes.",
    ],
    steps: [
      { icon: "scan", title: "Genie works all night", text: "While you sleep it finds buyers, writes content, checks AI search, and builds your authority." },
      { icon: "tasks", title: "It leaves you a short list", text: "Each morning you get a tidy list of things to approve. No busywork, no blank pages." },
      { icon: "check", title: "You approve in minutes", text: "Tap approve and Genie publishes or sends. You stay in control; it does the heavy lifting." },
    ],
    genie: "Runs your whole marketing engine overnight.",
    you: "Skim the list and approve — about 5 minutes.",
    benefit: "A full marketing team's output, for a 5-minute daily check-in.",
  },
  approvals: {
    name: "Approvals", icon: "tasks",
    what: "Everything Genie wrote for you, waiting for your yes before it goes live.",
    use: [
      "Pick any item from the “Up next” list on the right.",
      "Read the preview in the middle — the exact article, image or post that will go out.",
      "Click Approve to publish it, edit it first, or dismiss it. Use “Approve all high-impact” to clear several at once.",
    ],
    steps: [
      { icon: "write", title: "Genie drafts the work", text: "Articles, social posts, and images — all written in your brand voice, ready to publish." },
      { icon: "eye", title: "You review each one", text: "See exactly what will go out. Approve as-is, tweak the words, or swap the image." },
      { icon: "growth", title: "Approve → it goes live", text: "Genie publishes to your site (or a hosted page) and instantly submits it for fast indexing." },
    ],
    genie: "Writes, designs, publishes, and indexes.",
    you: "Review and approve (or tweak first).",
    benefit: "Nothing goes out under your name without your ok — but you never start from scratch.",
  },
  hunt: {
    name: "Buyer Hunt", icon: "crosshair",
    what: "Genie hunts down people who are ready to buy right now, and hands them to you.",
    use: [
      "There's no keyword to type — just click “Find buyers now” (top-right). Genie already knows your business.",
      "Optional: type competitor names in the “Poach from rivals” box first, to hunt people wanting an alternative to them.",
      "On any buyer card, click “See reply” to read Genie's draft, then “Engage” — it copies the reply and opens the thread so you paste, tweak and post.",
    ],
    steps: [
      { icon: "search", title: "Scans where buyers ask", text: "Reddit, Quora, forums, Hacker News — anywhere people ask 'what should I buy?'" },
      { icon: "target", title: "Scores real intent 0–100", text: "It ranks each person by how ready they are, so you focus on the hottest leads first." },
      { icon: "write", title: "Drafts the perfect reply", text: "A genuinely helpful, non-spammy response you can post to win them over." },
    ],
    genie: "Finds the buyers, scores them, writes the reply.",
    you: "Click “Find buyers now”, then Engage the ones you like.",
    benefit: "Instead of waiting to be found, Genie chases down people about to spend money.",
  },
  recover: {
    name: "Revenue Recovery", icon: "coins",
    what: "Turn your old, cold leads and lapsed customers back into paying buyers.",
    use: [
      "Paste or upload your list of old leads, quotes and past customers.",
      "Optional: add a comeback offer (e.g. “20% off if you return this week”).",
      "Genie writes a personal win-back for each — review them and send from your own Gmail.",
    ],
    steps: [
      { icon: "inbox", title: "You add your old leads", text: "A simple list of people who went quiet, never bought, or drifted away." },
      { icon: "brain", title: "Genie reads each one", text: "It works out why they went cold and what would bring them back." },
      { icon: "mail", title: "Writes a tailored win-back", text: "A specific, personal email you send from your Gmail. Warm contacts convert fast." },
    ],
    genie: "Classifies each lead and writes the win-back email.",
    you: "Upload the list, add an offer, and send the drafts.",
    benefit: "The fastest money in the building — people who already know you, re-activated in days.",
  },
  pipeline: {
    name: "Deal Pipeline", icon: "board",
    what: "One board that tracks everyone Genie reached, all the way to closed revenue.",
    use: [
      "Nothing to set up — it fills in automatically from everyone Genie has emailed.",
      "Work the “Needs you” replies first (Genie has already sorted them: interested, question, objection…).",
      "Mark each deal won or lost so your real revenue and win-rate show up.",
    ],
    steps: [
      { icon: "megaphone", title: "Everyone reached, in one place", text: "Every message across every channel lands on one board." },
      { icon: "conversations", title: "Replies sorted for you", text: "Genie reads each reply and tags it: interested, question, objection, or not now." },
      { icon: "coins", title: "Won deals + real revenue", text: "Mark deals won; the money shows up and Genie learns what actually closes." },
    ],
    genie: "Tracks everyone and classifies every reply.",
    you: "Act on the hot replies and mark your wins.",
    benefit: "You always know who to follow up with next — no lead ever slips through the cracks.",
  },
  prospects: {
    name: "Find clients", icon: "target",
    what: "Name the kind of client you want; Genie finds real ones and how to reach them.",
    use: [
      "Type the kind of client you want in the box (e.g. “dental clinics in Texas” or “rug e-commerce brands”).",
      "Click Find — Genie returns real named companies, the decision-maker at each, and a contact.",
      "Review the tailored pitch it wrote for each one, then send it.",
    ],
    steps: [
      { icon: "search", title: "You name a niche", text: "For example 'dental clinics in Texas' or 'early-stage SaaS startups'." },
      { icon: "scan", title: "Genie finds real companies", text: "Named businesses, the decision-maker at each, and a verified way to contact them." },
      { icon: "write", title: "Writes a tailored pitch", text: "A personal outreach email written specifically for that company." },
    ],
    genie: "Finds the companies, the contacts, and writes the pitch.",
    you: "Type a niche in the box and send the pitches.",
    benefit: "Outbound on autopilot — real prospects and ready-to-send pitches, not just a scraper.",
  },
  featured: {
    name: "Get featured", icon: "megaphone",
    what: "Get other websites to feature you and link back to you — the trust money can't buy.",
    use: [
      "Type your niche or topic in the box (e.g. “sustainable fashion”).",
      "Genie lists roundups, press and directories that could feature you, each with a drafted pitch.",
      "Send the outreach; results are saved per category so you never chase the same site twice.",
    ],
    steps: [
      { icon: "search", title: "Finds places to be featured", text: "Roundups, guest-post sites, press, and directories in your exact space." },
      { icon: "write", title: "Drafts the outreach", text: "A tailored pitch for each one, so busy editors are more likely to say yes." },
      { icon: "link", title: "You send, they feature you", text: "Each feature is a real backlink plus fresh eyeballs." },
    ],
    genie: "Finds the targets and writes the pitch.",
    you: "Type your niche and send the outreach.",
    benefit: "Other sites vouching for you (digital PR) is exactly what Google and AI reward.",
  },
  inbox: {
    name: "Inbox", icon: "inbox",
    what: "Every reply to Genie's outreach, gathered into one calm place.",
    use: [
      "Nothing to set up — replies to Genie's outreach land here automatically.",
      "Click a thread to read the full conversation.",
      "Reply right here and turn interest into a sale.",
    ],
    steps: [
      { icon: "mail", title: "Genie sends from your Gmail", text: "Compliant, capped outreach that lands as genuinely from you." },
      { icon: "inbox", title: "Replies come back here", text: "Every response threads into one place, with a notification when one lands." },
      { icon: "reply", title: "You reply and close", text: "Pick up the conversation and turn interest into a sale." },
    ],
    genie: "Sends the outreach and catches every reply.",
    you: "Reply to the interested people.",
    benefit: "No digging through a messy inbox — all your warm conversations in one view.",
  },
  conversations: {
    name: "Conversations", icon: "conversations",
    what: "Genie's drafted community posts (Reddit, Quora) — ready for you to share safely.",
    use: [
      "Click refresh — Genie finds live Reddit/Quora threads where your expertise genuinely helps.",
      "Open a draft and tweak it so it sounds like you.",
      "Post it yourself (Genie never auto-posts, to keep your accounts safe from bans).",
    ],
    steps: [
      { icon: "search", title: "Finds live threads", text: "Real discussions where your knowledge genuinely helps someone." },
      { icon: "write", title: "Writes a value-first reply", text: "In your voice, helpful first, your product mentioned only where it truly fits." },
      { icon: "check", title: "You post it yourself", text: "You paste and post, so your accounts stay 100% safe from automation bans." },
    ],
    genie: "Finds the threads and writes the reply.",
    you: "Post the drafts yourself.",
    benefit: "Builds your reputation where buyers hang out — without risking your accounts.",
  },
  growth: {
    name: "Growth Score", icon: "growth",
    what: "Your Google rankings, your page results, and where Genie is pushing you next.",
    use: [
      "Read your rankings, and the “What your pages are earning” panel (real clicks + leads per page).",
      "Use the buttons up top: Refresh rankings, Build topic hub, or Optimize local services (if you're a local business).",
      "First time here? Click “Build strategy” so Genie picks the keywords to chase.",
    ],
    steps: [
      { icon: "growth", title: "Tracks your Google rank", text: "Records your position every night, so you can watch the climb over time." },
      { icon: "target", title: "Shows what's working", text: "Which pages earn clicks and leads, and which keywords are winning." },
      { icon: "bolt", title: "Points to the next win", text: "Genie shows what it's doing next to move you up — and lets you trigger a topic hub or local optimization." },
    ],
    genie: "Tracks, measures, and keeps pushing you up.",
    you: "Watch the numbers; tap the buttons when you want to push harder.",
    benefit: "One honest place to see the machine working — and the money it's starting to make.",
  },
  aisearch: {
    name: "AI Search Presence", icon: "search",
    what: "Whether ChatGPT, Perplexity and Gemini recommend YOU when buyers ask them — and how to win it.",
    use: [
      "Click the button to run the check — Genie asks the AIs your buyers' questions.",
      "See the questions where AI names a rival instead of you (marked “Not cited”).",
      "Approve the answer page Genie drafts for each gap — it appears in your Approvals to publish.",
    ],
    steps: [
      { icon: "search", title: "Asks the AIs your buyers' questions", text: "Genie literally asks ChatGPT, Perplexity and Gemini what they recommend." },
      { icon: "scan", title: "Finds where a rival wins, not you", text: "It spots the exact questions where AI names a competitor instead of you." },
      { icon: "write", title: "Writes a more source-worthy page", text: "A better, more citable answer page to improve your odds of being quoted — dropped into Approvals." },
    ],
    genie: "Checks the AIs and writes the winning page.",
    you: "Run the check, then approve the answer pages.",
    benefit: "In 2026, if AI doesn't cite you, you're invisible. Genie works to make it cite you.",
  },
  analytics: {
    name: "What Genie Learned", icon: "brain",
    what: "The lessons Genie has picked up about your buyers — and how it's using them to earn you more.",
    use: [
      "Nothing to do here — just read what Genie has learned about your buyers.",
      "These insights quietly steer what Genie writes and where it focuses next, on their own.",
    ],
    steps: [
      { icon: "brain", title: "Watches what converts", text: "Which topics, channels and messages actually turn into customers." },
      { icon: "growth", title: "Doubles down on winners", text: "It shifts effort toward what works and away from what doesn't." },
      { icon: "spark", title: "Gets smarter every day", text: "Your Genie compounds — it's more effective this month than it was last month." },
    ],
    genie: "Learns from every result and adapts on its own.",
    you: "Nothing — just watch it get sharper.",
    benefit: "Unlike a hired agency, Genie never forgets a lesson. It compounds for you.",
  },
  foundation: {
    name: "Foundation links", icon: "link",
    what: "High-authority profiles that plant your brand everywhere Google and AI look.",
    use: [
      "Copy your ready-made bios from the top — Genie already wrote them.",
      "Click “Open & create” on each site, sign up, and paste the bio (the Chrome one even includes a ready extension).",
      "Tick each one done — your progress is saved so you can chip away over time.",
    ],
    steps: [
      { icon: "link", title: "A curated checklist", text: "About 18 free, trusted sites (plus a Chrome Web Store listing) where your brand should exist." },
      { icon: "write", title: "Genie writes your bios", text: "Ready-to-paste bios so every profile is consistent and on-brand." },
      { icon: "check", title: "You sign up, it tracks progress", text: "Create each account (signups need a human), and Genie remembers what's done." },
    ],
    genie: "Writes the bios and tracks your progress.",
    you: "Create the accounts and paste the bios.",
    benefit: "A consistent brand everywhere people (and AI) go looking for you.",
  },
  impact: {
    name: "Customer Impact", icon: "bolt",
    what: "The real money Genie has earned you, traced from the first click to the actual sale.",
    use: [
      "Copy your private webhook URL and paste it into Stripe/Shopify (the exact steps are on the card).",
      "Send a test event, then click “Recheck” — Genie confirms the moment it's connected.",
      "From then on, every sale shows here, traced to the page or message that drove it.",
    ],
    steps: [
      { icon: "link", title: "Connect your revenue", text: "A guided 3-step webhook from Stripe or Shopify — Genie confirms the moment it's connected." },
      { icon: "bolt", title: "Every sale is traced back", text: "Genie ties each purchase to the exact page or message that drove it." },
      { icon: "coins", title: "See real dollars earned", text: "Not vanity metrics — the actual revenue Genie influenced." },
    ],
    genie: "Traces every sale back to its source.",
    you: "Connect your payment provider once.",
    benefit: "Proof, in dollars. You see exactly what Genie is earning you.",
  },
  connections: {
    name: "Connections", icon: "link",
    what: "Plug Genie into your tools so it can work on your real accounts, not a demo.",
    use: [
      "Click “Connect Google” and sign in — this unlocks live rankings, faster indexing and sending outreach from your Gmail.",
      "Optionally connect WordPress (to publish to your own blog) and your revenue provider.",
      "Check the deliverability card so your outreach actually reaches inboxes, not spam.",
    ],
    steps: [
      { icon: "link", title: "Connect Google", text: "Unlocks live rankings, faster indexing, and sending outreach from your own Gmail." },
      { icon: "growth", title: "Connect your blog (optional)", text: "Publish articles straight to your own WordPress site instead of a hosted page." },
      { icon: "check", title: "The more you connect, the more it does", text: "Each connection switches on another piece of Genie's power." },
    ],
    genie: "Uses your tools to work on your real business.",
    you: "Sign in to your accounts once.",
    benefit: "A few one-time connections turn Genie from a demo into your real marketing employee.",
  },
  capabilities: {
    name: "What Genie can do", icon: "spark",
    what: "The full menu of everything your AI employee does for you.",
    use: [
      "Browse every capability, grouped by the job it does.",
      "Check the little status tag — “Active” now, or what needs a one-time connection.",
      "Tap any card to jump straight to where it lives and use it.",
    ],
    steps: [
      { icon: "spark", title: "Every capability, grouped by job", text: "From finding buyers to closing deals — the whole skill set in one place." },
      { icon: "check", title: "Honest status on each", text: "What's live now versus what needs a one-time connection to switch on." },
      { icon: "target", title: "Tap through to use it", text: "Each one links to where it lives, so you can put it straight to work." },
    ],
    genie: "Does all of it, mostly on autopilot.",
    you: "Browse and explore.",
    benefit: "A clear map of your AI employee's whole skill set — nothing hidden.",
  },
  sprint: {
    name: "Proof Sprint", icon: "flag",
    what: "A focused 30-day test that proves — with real numbers — whether Genie actually makes you money.",
    use: [
      "Fill in your ONE customer type and ONE offer, plus a goal (e.g. 3 sales in 30 days).",
      "Click “Start my 30-day sprint”.",
      "Run the outreach Genie drafts, log your meetings/proposals with the +/− buttons, and watch the day-30 verdict.",
    ],
    steps: [
      { icon: "target", title: "Pick one customer + one offer", text: "You commit to the single customer type most likely to buy, and the one offer you'll pitch." },
      { icon: "crosshair", title: "Run the fast-money engine for 30 days", text: "Genie hunts buyers, finds clients, and recovers old leads while you send. This page keeps score." },
      { icon: "check", title: "Get a plain verdict at day 30", text: "It tracks the 7 numbers that matter and tells you: scale it, tweak one thing, or fix the offer." },
    ],
    genie: "Runs the outreach + tracks the real numbers automatically.",
    you: "Set the target + offer, send the drafts, log your meetings.",
    benefit: "Turns 'it looks powerful' into proof (or shows exactly what to fix) — the one thing that tells you if this is a business.",
  },
};
