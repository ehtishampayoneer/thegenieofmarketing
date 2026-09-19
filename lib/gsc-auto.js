// lib/gsc-auto.js
// ── SEARCH CONSOLE, WITHOUT THE BUTTON ──
// Genie tells owners "I set this up for you", but the setup only ran when they
// found and pressed a button on the Connections page. So the common case —
// someone connects Google, reads that sentence, and assumes it is handled —
// ended with Genie blind to their real rankings for weeks.
//
// This runs on the nightly pass instead. It finishes the job whenever it can do
// so honestly:
//   • the property already exists (someone verified it another way) -> remember it
//   • Genie's WordPress plugin is installed -> it puts the tag there and verifies
//   • the owner already pasted the tag (or it was added for them) -> verify it
// When the tag genuinely is not on the site, it does nothing and stays quiet:
// the Connections card and the "Your first results" step still ask for it, which
// is the honest place for a request that needs a human.

import { getValidAccessToken } from "@/lib/google";
import { resolveGscProperty } from "@/lib/gsc";
import { verifyOwnership, addSearchConsoleProperty, installTagViaWordPress, getVerificationTag, propertyUrl } from "@/lib/gsc-setup";
import { connScopes } from "@/lib/gmail";
import { logActivity } from "@/lib/activity";

/** Finish Search Console setup for one business if it can be done unattended. */
export async function autoSetupSearchConsole(admin, { userId, host }) {
  try {
    if (!host) return { skipped: "no_host" };

    let google = null, wp = null;
    try {
      const { data } = await admin.from("connections").select("*").eq("user_id", userId);
      for (const c of data || []) { if (c.provider === "google") google = c; if (c.provider === "wordpress") wp = c; }
    } catch {}
    if (!google) return { skipped: "no_google" };
    if (google.gsc_site) return { skipped: "already" };
    if (!connScopes(google).includes("siteverification")) return { skipped: "needs_reconnect" };

    const token = await getValidAccessToken(admin, google);
    if (!token) return { skipped: "no_token" };

    // Someone may have verified it elsewhere; adopting it costs nothing.
    const existing = await resolveGscProperty(token, host);
    if (existing) return await remember(admin, userId, host, existing, "found");

    // Genie's own plugin is the one place it may write to the owner's site.
    if (wp) {
      const tag = await getVerificationTag(token, host);
      if (tag.ok) {
        const put = await installTagViaWordPress(wp, tag.content);
        if (put.ok) {
          await new Promise((r) => setTimeout(r, 2500));   // WordPress caches pages
          const v = await verifyOwnership(token, host);
          if (v.ok) {
            const added = await addSearchConsoleProperty(token, host);
            if (added.ok) return await remember(admin, userId, host, propertyUrl(host), "wordpress");
          }
        }
      }
    }

    // The tag may already be on the site (pasted by the owner, or by whoever
    // looks after it). Asking Google to check costs one call and finishes the
    // job for everyone who did that and never came back to press Verify.
    const v = await verifyOwnership(token, host);
    if (v.ok) {
      const added = await addSearchConsoleProperty(token, host);
      if (added.ok) return await remember(admin, userId, host, propertyUrl(host), "tag_found");
      return { skipped: "add_failed", error: added.error };
    }
    return { skipped: "not_verified" };
  } catch { return { skipped: "error" }; }
}

async function remember(admin, userId, host, site, via) {
  try { await admin.from("connections").update({ gsc_site: site }).eq("user_id", userId).eq("provider", "google"); } catch {}
  try {
    await logActivity(admin, userId, {
      host, verb: "connected", icon: "🔌",
      message: "Search Console connected — your real Google rankings start flowing",
      detail: via === "wordpress" ? "Genie verified your site through its WordPress plugin." : via === "found" ? "Genie found your existing property and adopted it." : "Genie found the verification tag on your site and finished the setup.",
      meta: { site, via },
    });
  } catch {}
  return { done: true, site, via };
}
