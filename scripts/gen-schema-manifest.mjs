import fs from "fs";
import path from "path";
const ROOT = process.cwd();
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(p);
  return /\.js$/.test(e.name) ? [p] : [];
});
const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))];
const uses = {};
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)([^;]{0,700})/g)) {
    const t = m[1];
    if (t === "storage") continue;
    // Skip Supabase Storage buckets: `.storage.from("bucket")`
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    if (/storage\s*$/.test(before)) continue;
    const chain = m[2].split(/\.from\(/)[0];
    uses[t] ||= new Set();
    const sel = chain.match(/\.select\(\s*["'`]([^"'`]*)["'`]/);
    if (sel && sel[1].trim() !== "*") {
      for (const c of sel[1].split(",")) {
        // PostgREST writes a renamed column as `alias:column`, and a field inside a
        // JSON column as `payload->>market`. Taking the text before the colon read
        // the ALIAS as the column, so `market:payload->>market` became a column
        // called "market" that does not exist — and the self-test would have gone
        // red telling the owner to add it. A `::` cast is not an alias.
        let tok = c.trim();
        const renamed = tok.match(/^([a-z_][a-z0-9_]*):(?!:)(.+)$/i);
        if (renamed) tok = renamed[2].trim();
        const n = tok.split(/[\s:(!]|->/)[0];
        if (/^[a-z_][a-z0-9_]*$/.test(n)) uses[t].add(n);
      }
    }
    for (const fm of chain.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|order|is|in|ilike|contains)\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/g)) uses[t].add(fm[1]);
  }
}
const out = Object.keys(uses).sort().map((t) => `  ${t}: ${JSON.stringify([...uses[t]].sort())},`).join("\n");
const file = `// lib/schema-manifest.js
// GENERATED from the code: every table, and every column the code selects or
// filters on. /api/diagnostics probes the live database against this, because the
// database is edited by hand and falls behind the code without any error: a
// missing column makes a query return nothing, and features quietly do nothing.
// Regenerate after adding queries with: node scripts/gen-schema-manifest.mjs.
export const SCHEMA_MANIFEST = {
${out}
};
`;
// ── --check: SAY WHETHER IT IS STALE, WITHOUT WRITING ──
// This file only worked when someone remembered to run it after changing a query,
// and nobody always does. It was found stale on 27 Sep with three real columns
// the self-test was not probing. test/schema-manifest.test.js runs this with
// --check, so the suite fails the moment the committed list falls behind the code.
const target = path.join(ROOT, "lib/schema-manifest.js");
if (process.argv.includes("--check")) {
  // Git on Windows checks this file out with CRLF line endings; compare content, not line endings.
  const CR = new RegExp(String.fromCharCode(13), "g");
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(CR, "") : "";
  if (current !== file) {
    console.error("lib/schema-manifest.js is out of date. Run: node scripts/gen-schema-manifest.mjs");
    process.exit(1);
  }
  console.log("schema manifest is current:", Object.keys(uses).length, "tables");
  process.exit(0);
}
fs.writeFileSync(target, file);
console.log(Object.keys(uses).length, "tables");
