import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

// Resolve the "@/..." path alias (from jsconfig) so tests can import libs the same
// way the app does — no extra plugin needed. Keeps the test setup dependency-light.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { environment: "node", include: ["test/**/*.test.js"] },
});
