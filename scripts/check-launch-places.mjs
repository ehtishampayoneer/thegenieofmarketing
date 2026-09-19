// scripts/check-launch-places.mjs
// Opens every place in lib/launch-places.js and reports the ones that no longer
// load, so the list can be pruned. 403/429 from big sites is bot protection, not
// a dead site, and is reported separately.
//   node scripts/check-launch-places.mjs
import { PLACES } from "../lib/launch-places.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";
const dead = [], guarded = [];
await Promise.all(PLACES.map(async (p) => {
  try {
    const res = await fetch(p.url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (res.status === 403 || res.status === 429) guarded.push(`${p.name} (${res.status})`);
    else if (!res.ok) dead.push(`${p.name}: ${res.status} ${p.url}`);
  } catch (e) { dead.push(`${p.name}: ${e?.cause?.code || e?.name || e} ${p.url}`); }
}));
console.log(`${PLACES.length} places, ${dead.length} not loading, ${guarded.length} behind bot protection.`);
if (guarded.length) console.log("Bot-protected (fine):", guarded.join(", "));
for (const d of dead) console.log("NOT LOADING", d);
process.exit(dead.length ? 1 : 0);
