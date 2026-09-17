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
        const n = c.trim().split(/[\s:(!]/)[0];
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
fs.writeFileSync(path.join(ROOT, "lib/schema-manifest.js"), file);
console.log(Object.keys(uses).length, "tables");
