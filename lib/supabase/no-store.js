// lib/supabase/no-store.js
// ── THE DATABASE IS NEVER READ FROM A CACHE ──
// Next 14 keeps every GET fetch() in its Data Cache, forever, unless something tells
// it not to, and `dynamic = "force-dynamic"` does NOT tell it: in a route that never
// touches cookies or headers (the owner's blog, /p, the sitemaps, llms.txt, the cron)
// a Supabase read was answered with whatever that exact query returned the first time
// it ever ran, across deployments. That is how the ARQR blog kept listing an article
// that no longer existed (it 404'd when opened, because that query was new) while
// the article that did exist opened fine and was missing from the list.
//
// Every Supabase request goes through this, so no read, in any route, can be stale.
export function noStoreFetch(input, init) {
  return fetch(input, { ...(init || {}), cache: "no-store" });
}
