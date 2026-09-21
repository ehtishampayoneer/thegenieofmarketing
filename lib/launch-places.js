// lib/launch-places.js
// ── PLACES TO LIST AND LAUNCH A BUSINESS ──
// A curated, checked directory of the places worth being listed on: launch sites,
// software review sites, AI tool directories, local listings and the communities
// that welcome a "I built this" post.
//
// Started from github.com/mmccaff/PlacesToPostYourStartup (CC0) and extended with
// the places that matter most in 2026 for being FOUND and CITED: review sites and
// "alternatives" sites are what AI assistants quote when someone asks "what's the
// best tool for X", and local listings are what Google Maps and AI read for local
// businesses. Every URL was opened on 2026-09-19; dead and moved ones were dropped
// (All Startups, GeekWire list, Launched, Loop, Vator, Slant, State of Tech,
// Appvita, CrozDesk, TechMap, old Software Advice form). Re-check with
// `node scripts/check-launch-places.mjs`.
//
// Honest expectations, shown to the owner too:
//   • Launch sites give a burst of visitors and early users for a day or two.
//   • Review and "alternatives" sites keep sending buyers for years, and are the
//     pages AI assistants cite. These are the most valuable over time.
//   • Small directories give a listing and sometimes a link. Worth a few minutes
//     each, never worth paying for, and most links are nofollow.
//   • Genie does not submit for you: nearly all of these need your own account,
//     and many check for bots. Genie writes everything, opens the page, and keeps
//     track of what is done so nothing is repeated.
//
// fits: which businesses a place suits.
//   software  apps, SaaS, tools          ai        AI products
//   b2b       sold to businesses         consumer  sold to the public
//   local     serves a local area        services  agencies, studios, consultants
//   home      furniture, interiors, home improvement
//   startup   any new product (launch and founder communities)
// tier: 1 = go here first, 2 = worth it, 3 = quick extra listing.
// copy: which part of the launch kit to paste.

export const PLACES = [
  // ── Launch days ────────────────────────────────────────────────────────────
  { id: "producthunt", name: "Product Hunt", url: "https://www.producthunt.com/launch", kind: "launch", tier: 1, fits: ["software", "ai", "startup", "consumer"], copy: "launch",
    why: "The biggest launch day. A good launch brings thousands of visitors and a permanent listing AI tools read.",
    rule: "Launch at 00:01 Pacific, reply to every comment all day, and ask friends to visit, never to upvote." },
  { id: "showhn", name: "Show HN (Hacker News)", url: "https://news.ycombinator.com/submit", kind: "launch", tier: 1, fits: ["software", "ai", "startup", "b2b"], copy: "showhn",
    why: "Huge technical audience. Front page means tens of thousands of visitors in a day.",
    rule: "Title must start with 'Show HN:'. It has to be something people can try. Plain, modest wording; no marketing voice." },
  { id: "betalist", name: "BetaList", url: "https://betalist.com/submit", kind: "launch", tier: 1, fits: ["software", "ai", "startup"], copy: "launch",
    why: "Early adopters who sign up for new products. Good for first users.", rule: "Free listing has a wait; only for products still new." },
  { id: "indiehackers", name: "Indie Hackers", url: "https://www.indiehackers.com/products/new", kind: "community", tier: 1, fits: ["software", "ai", "startup", "b2b"], copy: "story",
    why: "Founders and early customers. A product page plus an honest milestone post does well.", rule: "Share numbers and lessons, not an advert." },
  { id: "peerlist", name: "Peerlist Launchpad", url: "https://peerlist.io/launchpad", kind: "launch", tier: 2, fits: ["software", "ai", "startup"], copy: "launch", why: "Weekly launches for builders; steady early traffic.", rule: "Needs a Peerlist profile." },
  { id: "uneed", name: "Uneed", url: "https://www.uneed.best/submit-a-tool", kind: "launch", tier: 2, fits: ["software", "ai", "startup"], copy: "launch", why: "Daily launch list with a real audience of makers.", rule: "Free queue is long; you can still list for free." },
  { id: "devhunt", name: "DevHunt", url: "https://devhunt.org/", kind: "launch", tier: 2, fits: ["software", "ai"], copy: "launch", why: "Product Hunt for developer tools.", rule: "Only for tools developers use." },
  { id: "microlaunch", name: "Microlaunch", url: "https://microlaunch.net/", kind: "launch", tier: 2, fits: ["software", "ai", "startup"], copy: "launch", why: "Month-long launches with feedback from makers.", rule: "" },
  { id: "fazier", name: "Fazier", url: "https://fazier.com/", kind: "launch", tier: 2, fits: ["software", "ai", "startup"], copy: "launch", why: "Daily launches with a dofollow link for top products.", rule: "" },
  { id: "tinylaunch", name: "TinyLaunch", url: "https://www.tinylaunch.com", kind: "launch", tier: 3, fits: ["software", "ai", "startup"], copy: "launch", why: "Small weekly launch list.", rule: "" },
  { id: "tinystartups", name: "Tiny Startups", url: "https://www.tinystartups.com/", kind: "launch", tier: 3, fits: ["software", "ai", "startup"], copy: "launch", why: "Newsletter and list of small startups.", rule: "" },
  { id: "openlaunch", name: "Open Launch", url: "https://open-launch.com/", kind: "launch", tier: 3, fits: ["software", "ai", "startup"], copy: "launch", why: "Free launch platform.", rule: "" },
  { id: "startupfame", name: "Startup Fame", url: "https://startupfa.me/", kind: "launch", tier: 3, fits: ["software", "ai", "startup"], copy: "launch", why: "Launch list with a listing page.", rule: "" },
  { id: "launchignite", name: "LaunchIgniter", url: "https://launchigniter.com/submit", kind: "launch", tier: 3, fits: ["software", "ai", "startup"], copy: "launch", why: "Launch list.", rule: "" },
  { id: "launchingnext", name: "Launching Next", url: "https://www.launchingnext.com/submit/", kind: "launch", tier: 3, fits: ["software", "startup"], copy: "launch", why: "Long-running list of new startups.", rule: "" },
  { id: "startupbase", name: "StartupBase", url: "https://startupbase.io/submit", kind: "launch", tier: 3, fits: ["software", "startup"], copy: "launch", why: "Community of makers.", rule: "" },
  { id: "sideprojectors", name: "SideProjectors", url: "https://www.sideprojectors.com", kind: "launch", tier: 3, fits: ["software", "startup"], copy: "launch", why: "Side projects, including ones for sale.", rule: "" },
  { id: "websitehunt", name: "Website Hunt", url: "https://www.websitehunt.co", kind: "launch", tier: 3, fits: ["software", "startup", "consumer"], copy: "launch", why: "Daily list of new websites.", rule: "" },
  { id: "10words", name: "10words", url: "https://10words.io", kind: "launch", tier: 3, fits: ["software", "startup"], copy: "launch", why: "Startups described in ten words.", rule: "" },
  { id: "betabound", name: "Beta Bound", url: "https://betabound.com/announce/", kind: "launch", tier: 3, fits: ["software", "consumer"], copy: "launch", why: "Beta testers looking for products to try.", rule: "Only while you want testers." },
  { id: "betatesting", name: "BetaTesting", url: "https://betatesting.com/beta-testing", kind: "launch", tier: 3, fits: ["software", "consumer"], copy: "launch", why: "Recruits beta testers.", rule: "" },

  // ── Review and "alternatives" sites: what buyers and AI assistants read ────
  { id: "g2", name: "G2", url: "https://www.g2.com/products/new", kind: "review", tier: 1, fits: ["software", "ai", "b2b"], copy: "long",
    why: "The review site B2B buyers check, and one of the most cited sources in AI answers about software.", rule: "Free listing. Ask real customers for reviews; never write your own." },
  { id: "capterra", name: "Capterra, GetApp and Software Advice", url: "https://digitalmarkets.gartner.com/", kind: "review", tier: 1, fits: ["software", "ai", "b2b"], copy: "long",
    why: "One free Gartner listing puts you on all three. Heavily cited by Google and AI for 'best X software'.", rule: "Free basic listing; paid placement is optional and not needed." },
  { id: "alternativeto", name: "AlternativeTo", url: "https://alternativeto.net/", kind: "review", tier: 1, fits: ["software", "ai", "consumer", "b2b"], copy: "short",
    why: "People search 'alternative to <big brand>'. Listing as an alternative to the leader in your space catches those buyers, and AI quotes it.", rule: "Add your app, then list it as an alternative to the well-known competitors." },
  { id: "saashub", name: "SaaSHub", url: "https://www.saashub.com/", kind: "review", tier: 1, fits: ["software", "ai", "b2b"], copy: "short", why: "Software comparisons and alternatives, well indexed by Google.", rule: "Free listing." },
  { id: "trustradius", name: "TrustRadius", url: "https://www.trustradius.com/vendors", kind: "review", tier: 2, fits: ["software", "b2b"], copy: "long", why: "B2B review site with detailed reviews.", rule: "Free vendor profile." },
  { id: "sourceforge", name: "SourceForge", url: "https://sourceforge.net/software/vendors/", kind: "review", tier: 2, fits: ["software", "b2b"], copy: "long", why: "Large software directory with comparison pages.", rule: "Free vendor listing." },
  { id: "crunchbase", name: "Crunchbase", url: "https://www.crunchbase.com/", kind: "review", tier: 1, fits: ["software", "ai", "startup", "b2b", "consumer"], copy: "long",
    why: "The company record AI assistants and journalists check first. Makes the business look real.", rule: "Free company profile." },
  { id: "wellfound", name: "Wellfound (AngelList)", url: "https://wellfound.com/", kind: "review", tier: 2, fits: ["startup", "software", "ai"], copy: "long", why: "Startup profile seen by investors and job seekers.", rule: "" },
  { id: "stackshare", name: "StackShare", url: "https://stackshare.io/", kind: "review", tier: 2, fits: ["software"], copy: "short", why: "Where developers compare tools.", rule: "Only for developer tools and infrastructure." },
  { id: "f6s", name: "F6S", url: "https://www.f6s.com/", kind: "review", tier: 3, fits: ["startup"], copy: "long", why: "Startup profile, programs and deals.", rule: "" },
  { id: "gust", name: "Gust", url: "https://gust.com/", kind: "review", tier: 3, fits: ["startup"], copy: "long", why: "Startup profile for investors.", rule: "" },
  { id: "trustpilot", name: "Trustpilot", url: "https://business.trustpilot.com/", kind: "review", tier: 1, fits: ["consumer", "local", "b2b", "home", "services"], copy: "short",
    why: "The review stars people and Google see for consumer businesses.", rule: "Free account. Invite real customers; never buy reviews." },
  { id: "clutch", name: "Clutch", url: "https://clutch.co/", kind: "review", tier: 1, fits: ["services", "b2b"], copy: "long", why: "Where companies choose agencies and service firms; cited by AI for 'best agency for X'.", rule: "Free profile; reviews come from verified client interviews." },
  { id: "goodfirms", name: "GoodFirms", url: "https://www.goodfirms.co/", kind: "review", tier: 2, fits: ["services", "b2b", "software"], copy: "long", why: "Directory of service firms and software.", rule: "" },
  { id: "sortlist", name: "Sortlist", url: "https://www.sortlist.com/", kind: "review", tier: 2, fits: ["services", "b2b"], copy: "long", why: "Matches businesses with agencies.", rule: "" },

  // ── AI tool directories ────────────────────────────────────────────────────
  { id: "taaft", name: "There's An AI For That", url: "https://theresanaiforthat.com/submit/", kind: "ai", tier: 1, fits: ["ai"], copy: "short", why: "The biggest AI tool directory; real traffic.", rule: "Paid review queue; worth it only for a real AI product." },
  { id: "futurepedia", name: "Futurepedia", url: "https://www.futurepedia.io/submit-tool", kind: "ai", tier: 2, fits: ["ai"], copy: "short", why: "Large AI directory.", rule: "" },
  { id: "toolify", name: "Toolify", url: "https://www.toolify.ai/submit", kind: "ai", tier: 2, fits: ["ai"], copy: "short", why: "AI directory with traffic stats.", rule: "" },
  { id: "aicollection", name: "That AI Collection", url: "https://thataicollection.com/", kind: "ai", tier: 3, fits: ["ai"], copy: "short", why: "Curated AI tools.", rule: "" },
  { id: "dangai", name: "Dang.ai", url: "https://dang.ai/submit", kind: "ai", tier: 3, fits: ["ai"], copy: "short", why: "AI tool directory.", rule: "" },
  { id: "aitoolsdirectory", name: "AI Tools Directory", url: "https://aitoolsdirectory.com/", kind: "ai", tier: 3, fits: ["ai"], copy: "short", why: "AI tool directory.", rule: "" },

  // ── Local and consumer listings ───────────────────────────────────────────
  { id: "gbp", name: "Google Business Profile", url: "https://business.google.com/", kind: "local", tier: 1, fits: ["local", "home", "services", "consumer"], copy: "short",
    why: "The single most important listing for any business people visit or call. Powers Google Maps and local AI answers.", rule: "Use your real address or service area; Google verifies it." },
  { id: "bingplaces", name: "Bing Places", url: "https://www.bing.com/forbusiness/", kind: "local", tier: 1, fits: ["local", "home", "services", "consumer"], copy: "short", why: "Feeds Bing, and through it ChatGPT's local answers. Imports from Google in one click.", rule: "" },
  { id: "applebc", name: "Apple Business Connect", url: "https://business.apple.com/", kind: "local", tier: 2, fits: ["local", "home", "consumer"], copy: "short", why: "Apple Maps and Siri.", rule: "" },
  { id: "yelp", name: "Yelp for Business", url: "https://business.yelp.com/", kind: "local", tier: 2, fits: ["local", "home", "services", "consumer"], copy: "short", why: "Reviews people and AI assistants check for local businesses.", rule: "Free listing; ignore the ad sales calls." },
  { id: "nextdoor", name: "Nextdoor Business", url: "https://business.nextdoor.com/", kind: "local", tier: 3, fits: ["local", "home", "services"], copy: "short", why: "Neighbourhood recommendations.", rule: "" },
  { id: "houzz", name: "Houzz Pro", url: "https://www.houzz.com/pro", kind: "local", tier: 1, fits: ["home"], copy: "long", why: "Where people plan furniture and interiors; a profile and photos bring real buyers.", rule: "" },
  { id: "pinterest", name: "Pinterest Business", url: "https://business.pinterest.com/", kind: "local", tier: 2, fits: ["home", "consumer"], copy: "short", why: "Visual search for products and ideas; pins keep sending traffic for years.", rule: "Pin real product and room photos linking to your pages." },

  // ── Founder communities (Reddit) ───────────────────────────────────────────
  { id: "r-sideproject", name: "r/SideProject", url: "https://www.reddit.com/r/sideproject/submit", kind: "community", tier: 2, fits: ["software", "ai", "startup"], copy: "reddit", why: "Welcomes 'I built this' posts.", rule: "Say what you built and why; answer every comment." },
  { id: "r-imadethis", name: "r/IMadeThis", url: "https://www.reddit.com/r/imadethis/submit", kind: "community", tier: 3, fits: ["software", "startup", "consumer"], copy: "reddit", why: "Makers showing their work.", rule: "" },
  { id: "r-alphabeta", name: "r/AlphaandBetausers", url: "https://www.reddit.com/r/alphaandbetausers/submit", kind: "community", tier: 3, fits: ["software", "startup"], copy: "reddit", why: "People who want to test new products.", rule: "Ask for testers, not customers." },
  { id: "r-buildinpublic", name: "r/buildinpublic", url: "https://www.reddit.com/r/buildinpublic/submit", kind: "community", tier: 3, fits: ["software", "ai", "startup"], copy: "reddit", why: "Progress updates from founders.", rule: "Share progress and numbers." },
  { id: "r-microsaas", name: "r/microsaas", url: "https://www.reddit.com/r/microsaas/submit", kind: "community", tier: 3, fits: ["software"], copy: "reddit", why: "Small software businesses.", rule: "" },
  { id: "r-roastmystartup", name: "r/RoastMyStartup", url: "https://www.reddit.com/r/roastmystartup/submit", kind: "community", tier: 3, fits: ["startup", "software"], copy: "reddit", why: "Blunt feedback on your site and pitch.", rule: "Ask for criticism and take it well." },
  { id: "r-plugyourproduct", name: "r/plugyourproduct", url: "https://www.reddit.com/r/plugyourproduct/submit", kind: "community", tier: 3, fits: ["startup", "software", "consumer"], copy: "reddit", why: "Self-promotion allowed.", rule: "" },
  { id: "r-shamelessplug", name: "r/shamelessplug", url: "https://www.reddit.com/r/shamelessplug/submit", kind: "community", tier: 3, fits: ["startup", "consumer"], copy: "reddit", why: "Self-promotion allowed.", rule: "" },
  { id: "r-indiebiz", name: "r/IndieBiz", url: "https://www.reddit.com/r/indiebiz/submit", kind: "community", tier: 3, fits: ["startup", "consumer"], copy: "reddit", why: "Independent businesses.", rule: "" },
  { id: "r-thesidehustle", name: "r/thesidehustle", url: "https://www.reddit.com/r/thesidehustle/submit", kind: "community", tier: 3, fits: ["startup"], copy: "reddit", why: "Side businesses.", rule: "" },
  { id: "r-saas", name: "r/SaaS", url: "https://www.reddit.com/r/SaaS/", kind: "community", tier: 2, fits: ["software", "b2b"], copy: "story", why: "Big SaaS founder community.", rule: "No direct promotion: share a lesson or numbers, or use the weekly promo thread." },
  { id: "r-startups", name: "r/startups", url: "https://www.reddit.com/r/startups/", kind: "community", tier: 2, fits: ["startup"], copy: "story", why: "Large founder community.", rule: "Strict: promotion only in the pinned 'Share your startup' thread." },
  { id: "r-entrepreneur", name: "r/Entrepreneur", url: "https://www.reddit.com/r/entrepreneur/", kind: "community", tier: 2, fits: ["startup"], copy: "story", why: "Very large business audience.", rule: "Strict: no self-promotion outside the weekly thread." },
  { id: "r-eridealong", name: "r/EntrepreneurRideAlong", url: "https://www.reddit.com/r/EntrepreneurRideAlong/", kind: "community", tier: 3, fits: ["startup"], copy: "story", why: "Founders sharing their journey.", rule: "Journey posts, not ads." },
  { id: "r-smallbusiness", name: "r/smallbusiness", url: "https://www.reddit.com/r/smallbusiness/", kind: "community", tier: 3, fits: ["b2b"], copy: "story", why: "Small business owners: good if they are your buyers.", rule: "Strict: no promotion. Only helpful answers." },
  { id: "r-designcritiques", name: "r/Design_Critiques", url: "https://www.reddit.com/r/design_critiques/", kind: "community", tier: 3, fits: ["startup", "software"], copy: "story", why: "Feedback on your site's design.", rule: "Ask for feedback, not visitors." },

  // ── Startup directories and news (quick listings) ─────────────────────────
  { id: "starterstory", name: "Starter Story", url: "https://www.starterstory.com/", kind: "news", tier: 2, fits: ["startup", "consumer", "software"], copy: "story", why: "Founder interviews with real numbers; well read and well linked.", rule: "Pitch your story once you have revenue." },
  { id: "startupstash", name: "Startup Stash", url: "https://startupstash.com/", kind: "directory", tier: 3, fits: ["software", "b2b"], copy: "short", why: "Curated tools for startups.", rule: "" },
  { id: "startupinspire", name: "Startup Inspire", url: "https://www.startupinspire.com/submit", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup directory.", rule: "" },
  { id: "startupranking", name: "Startup Ranking", url: "https://www.startupranking.com/", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup directory by country.", rule: "" },
  { id: "startupblink", name: "StartupBlink", url: "https://www.startupblink.com/", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Map of startup ecosystems.", rule: "" },
  { id: "startupsgallery", name: "Startups Gallery", url: "https://startups.gallery/", kind: "directory", tier: 3, fits: ["startup", "software"], copy: "short", why: "Gallery of startup sites.", rule: "" },
  { id: "startuptracker", name: "Startup Tracker", url: "https://startuptracker.io/", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup database.", rule: "" },
  { id: "startupbenchmarks", name: "Startup Benchmarks", url: "https://startupbenchmarks.com/", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup directory.", rule: "" },
  { id: "startuptabs", name: "Startup Tabs", url: "https://www.startuptabs.com/", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup directory.", rule: "" },
  { id: "startup88", name: "Startup 88", url: "https://startup88.com/", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup directory.", rule: "" },
  { id: "startupbuffer", name: "Startup Buffer", url: "https://startupbuffer.com/", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup directory.", rule: "" },
  { id: "killerstartups", name: "KillerStartups", url: "https://killerstartups.com/submit-startup/", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Long-running startup directory.", rule: "" },
  { id: "alltopstartups", name: "AllTopStartups", url: "https://alltopstartups.com/submit-startup/", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup directory.", rule: "" },
  { id: "getworm", name: "Getworm", url: "https://getworm.com/submit-startup", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup directory.", rule: "" },
  { id: "pitchwall", name: "PitchWall", url: "https://pitchwall.co/product/submit", kind: "directory", tier: 3, fits: ["startup", "software"], copy: "short", why: "Product directory.", rule: "" },
  { id: "postmake", name: "Postmake", url: "https://postmake.io/submit", kind: "directory", tier: 3, fits: ["software"], copy: "short", why: "Directory of tools for makers.", rule: "" },
  { id: "simplelister", name: "SimpleLister", url: "https://simplelister.com/", kind: "directory", tier: 3, fits: ["software", "startup"], copy: "short", why: "Product listing.", rule: "" },
  { id: "saasrow", name: "SaasRow", url: "https://saasrow.com/", kind: "directory", tier: 3, fits: ["software"], copy: "short", why: "SaaS directory.", rule: "" },
  { id: "microsaasexamples", name: "Micro SaaS Examples", url: "https://www.microsaasexamples.com/", kind: "directory", tier: 3, fits: ["software"], copy: "short", why: "Examples of small SaaS businesses.", rule: "" },
  { id: "awesomeindie", name: "Awesome Indie", url: "https://awesomeindie.com", kind: "directory", tier: 3, fits: ["software", "startup"], copy: "short", why: "Indie products.", rule: "" },
  { id: "allmyfaves", name: "All My Faves", url: "https://allmyfaves.com/", kind: "directory", tier: 3, fits: ["consumer", "software"], copy: "short", why: "Visual directory of sites.", rule: "" },
  { id: "alternativeme", name: "Alternative.me", url: "https://alternative.me/", kind: "directory", tier: 3, fits: ["software"], copy: "short", why: "Software alternatives.", rule: "" },
  { id: "discovercloud", name: "Discover Cloud", url: "https://www.discovercloud.com/become-a-vendor", kind: "directory", tier: 3, fits: ["software", "b2b"], copy: "short", why: "B2B cloud software marketplace.", rule: "" },
  { id: "ebool", name: "eBool", url: "https://www.ebool.com/submit", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Startup directory.", rule: "" },
  { id: "landbook", name: "Land-book", url: "https://land-book.com/guidelines", kind: "directory", tier: 3, fits: ["startup", "software"], copy: "short", why: "Gallery of well-designed landing pages.", rule: "Only if your site's design is strong." },
  { id: "collaborizm", name: "Collaborizm", url: "https://www.collaborizm.com", kind: "directory", tier: 3, fits: ["startup"], copy: "short", why: "Project collaboration community.", rule: "" },
  { id: "changelog", name: "The Changelog", url: "https://github.com/thechangelog/ping", kind: "news", tier: 3, fits: ["software"], copy: "short", why: "Developer news; open-source and dev tools only.", rule: "" },
  { id: "apprater", name: "App Rater", url: "https://apprater.net/add/", kind: "directory", tier: 3, fits: ["software", "consumer"], copy: "short", why: "Mobile app directory.", rule: "Mobile apps only." },
  { id: "appsthunder", name: "AppsThunder", url: "https://appsthunder.com/submit-your-app/", kind: "directory", tier: 3, fits: ["software", "consumer"], copy: "short", why: "App reviews.", rule: "Mobile apps only." },
  { id: "appslisto", name: "Apps Listo", url: "https://appslisto.com/submit-your-app/", kind: "directory", tier: 3, fits: ["software", "consumer"], copy: "short", why: "App directory.", rule: "Mobile apps only." },
  { id: "appsmamma", name: "Apps Mamma", url: "https://appsmamma.com/submit-your-app/", kind: "directory", tier: 3, fits: ["software", "consumer"], copy: "short", why: "App directory.", rule: "Mobile apps only." },
  { id: "apppicker", name: "appPicker", url: "https://www.apppicker.com/", kind: "directory", tier: 3, fits: ["software", "consumer"], copy: "short", why: "App directory.", rule: "Mobile apps only." },
  { id: "webapprater", name: "Web App Rater", url: "https://webapprater.com/submit-your-web-application-for-review-html", kind: "directory", tier: 3, fits: ["software"], copy: "short", why: "Web app reviews.", rule: "" },
  { id: "snapmunk", name: "SnapMunk", url: "https://www.snapmunk.com/submit-your-startup/", kind: "news", tier: 3, fits: ["startup"], copy: "story", why: "Startup news site.", rule: "" },
  { id: "techpluto", name: "TechPluto", url: "https://www.techpluto.com/submit-a-startup/", kind: "news", tier: 3, fits: ["startup"], copy: "story", why: "Startup news site.", rule: "" },
  { id: "startupbeat", name: "StartupBeat", url: "https://startupbeat.com/startup-beat-featured-startup-pitch-guidelines/", kind: "news", tier: 3, fits: ["startup"], copy: "story", why: "Featured startup pitches.", rule: "" },
  { id: "nextbigwhat", name: "NextBigWhat", url: "https://www.nextbigwhat.com/", kind: "news", tier: 3, fits: ["startup", "software"], copy: "story", why: "Tech and product news.", rule: "" },
  { id: "inc42", name: "Inc42", url: "https://inc42.com/startup-submission/", kind: "news", tier: 3, fits: ["startup"], copy: "story", why: "Indian startup news.", rule: "", region: "India" },
  { id: "arcticstartup", name: "ArcticStartup", url: "https://arcticstartup.com/", kind: "news", tier: 3, fits: ["startup"], copy: "story", why: "Nordic startup news.", rule: "", region: "Nordics" },
  { id: "tapscape", name: "Tapscape", url: "https://www.tapscape.com/", kind: "news", tier: 3, fits: ["startup", "software"], copy: "story", why: "Tech news and reviews.", rule: "" },
  { id: "preapps", name: "PreApps", url: "https://www.preapps.com/", kind: "directory", tier: 3, fits: ["software", "consumer"], copy: "short", why: "Upcoming apps.", rule: "Mobile apps only." },
];

export const PLACE_INDEX = Object.fromEntries(PLACES.map((p) => [p.id, p]));

export const KIND_LABEL = {
  launch: "Launch day", review: "Review & comparison site", ai: "AI directory", local: "Local & consumer listing",
  community: "Community", directory: "Directory", news: "Startup news",
};

/**
 * What kind of business this is, from what Genie knows about it. Plain word
 * matching on the brief: good enough to sort a list, and the owner can always
 * show everything.
 */
export function businessFits(ai = {}) {
  const b = ai?.brief || {};
  const text = [
    ai.whatTheySell, ai.targetCustomer, ai.industry, ai.category, ai.businessModel, ai.summary,
    ...Object.values(b).map((v) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(" ") : "")),
  ].filter(Boolean).join(" ").toLowerCase();
  const has = (re) => re.test(text);
  const fits = new Set(["startup"]);
  if (has(/\b(saas|software|app|platform|tool|dashboard|api|plugin|extension|subscription)\b/)) fits.add("software");
  if (has(/\b(ai|a\.i\.|artificial intelligence|machine learning|llm|gpt|chatbot|agent)\b/)) fits.add("ai");
  if (has(/\b(businesses|companies|retailers|stores|brands|agencies|teams|b2b|merchants|enterprises|clinics|restaurants)\b/)) fits.add("b2b");
  if (has(/\b(consumers?|customers at home|shoppers|families|people who|buy online|homeowners|individuals)\b/)) fits.add("consumer");
  if (has(/\b(near me|local|city|town|visit us|our shop|our store|showroom|clinic|salon|restaurant|plumber|dentist|in-store)\b/)) fits.add("local");
  if (has(/\b(agency|studio|consult|consultancy|services? for|freelance|we build|we design|done-for-you)\b/)) fits.add("services");
  if (has(/\b(furniture|sofa|interior|home decor|kitchen|bedroom|living room|renovation|flooring|lighting)\b/)) fits.add("home");
  return [...fits];
}

/** Places that suit this business, best first. */
export function placesFor(fits = [], { all = false } = {}) {
  const want = new Set(fits);
  const score = (p) => p.fits.filter((f) => want.has(f) && f !== "startup").length;
  return PLACES
    .map((p) => ({ ...p, match: score(p) + (p.fits.includes("startup") && want.has("startup") ? 0.5 : 0) }))
    .filter((p) => all || p.match >= 1)
    .sort((a, b) => a.tier - b.tier || b.match - a.match || a.name.localeCompare(b.name));
}

/** The launch kit prompt: one AI call writes every piece the list asks for. */
export function kitPrompt(ai = {}, host = "", plan = "") {
  return `BUSINESS
Name: ${ai.businessName || host}
Website: https://${host}
What they sell: ${ai.whatTheySell || ""}
Customers: ${ai.targetCustomer || ""}
${plan || (ai.brief ? `Brief: ${JSON.stringify(ai.brief).slice(0, 2500)}` : "")}

Write the copy a founder pastes when listing this business on launch sites, review sites and communities. Plain, specific, honest. No hype words (revolutionary, game-changing, cutting-edge), no invented numbers, customers or awards.

Return ONLY this JSON:
{
 "tagline": "under 60 characters, says what it is and for whom",
 "short": "one or two sentences, under 260 characters",
 "long": "a 120-200 word description: the problem, what it does, who it is for, what makes it different, how to start",
 "categories": ["3-5 category names a directory would use"],
 "tags": ["5-8 short tags"],
 "competitors": ["2-4 well-known products or services people compare it with, only if you are confident"],
 "launch_comment": "the maker's first comment on a launch site, 80-150 words, first person, why it was built and what feedback is wanted",
 "showhn_title": "Show HN: <name> – <plain description>, under 80 characters",
 "reddit_title": "an honest post title, first person, not clickbait",
 "reddit_body": "120-220 words, first person: what was built, why, what is being asked of readers (feedback or testers). Link only at the end.",
 "story": "a 150-250 word founder story for communities that forbid ads: the problem, one lesson learned, one honest number or milestone if known (otherwise none), no link in the text"
}`;
}

/** Keep the kit well formed whatever the model returned. */
export function normalizeKit(j = {}) {
  const s = (v, n) => String(v || "").replace(/\s+\n/g, "\n").trim().slice(0, n);
  const list = (v, n) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, n) : []);
  return {
    tagline: s(j.tagline, 90), short: s(j.short, 400), long: s(j.long, 2000),
    categories: list(j.categories, 6), tags: list(j.tags, 10), competitors: list(j.competitors, 5),
    launchComment: s(j.launch_comment, 1500), showhnTitle: s(j.showhn_title, 100),
    redditTitle: s(j.reddit_title, 200), redditBody: s(j.reddit_body, 2500), story: s(j.story, 2500),
  };
}

/** The text to copy for a place, from the kit. */
export function copyFor(place, kit, host = "") {
  if (!kit) return "";
  const url = host ? `https://${host}` : "";
  switch (place.copy) {
    case "launch": return [kit.tagline, "", kit.short, "", kit.launchComment].filter((x) => x !== undefined).join("\n").trim();
    case "showhn": return `${kit.showhnTitle}\n${url}\n\n${kit.launchComment}`.trim();
    case "reddit": return `${kit.redditTitle}\n\n${kit.redditBody}`.trim();
    case "story": return kit.story;
    case "long": return [kit.tagline, "", kit.long, "", kit.categories.length ? `Categories: ${kit.categories.join(", ")}` : "", kit.tags.length ? `Tags: ${kit.tags.join(", ")}` : ""].filter(Boolean).join("\n").trim();
    default: return `${kit.tagline}\n\n${kit.short}`.trim();
  }
}
