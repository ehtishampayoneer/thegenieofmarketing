// lib/context.js
// ── AMBIENT REQUEST CONTEXT (AsyncLocalStorage) ──
// Set once where we resolve the user; every nested LLM/data call — now and
// forever, including calls buried in libs — is attributed automatically. No
// threading, no future silent-metering gaps. Node-native; all these routes run
// on the nodejs runtime. Best-effort: never throws, degrades to no-context.

import { AsyncLocalStorage } from "async_hooks";

const als = new AsyncLocalStorage();

// Set the context for the remainder of the current request's async chain.
export function setGenieContext(ctx) {
  try { als.enterWith(ctx || {}); } catch {}
}

export function getGenieContext() {
  try { return als.getStore() || null; } catch { return null; }
}
