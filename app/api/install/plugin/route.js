// app/api/install/plugin/route.js
// Serves a complete, single-file WordPress plugin with this user's tag already
// in it. They upload it in WordPress under Plugins, Add New, Upload, Activate.
//
// This exists because Genie cannot install it for them. WordPress core REST has
// no endpoint for injecting a site-wide header script, wp/v2/plugins needs an
// install_plugins capability that managed hosts disable, and pushing a
// third-party plugin into someone's site uninvited is well past what publishing
// a post implies. A file they choose to upload keeps the decision theirs.
//
// It is also better than the alternative: pasting into footer.php is undone by
// the next theme update, and a plugin is not.

import { createClient } from "@/lib/supabase/server";
import { makeIngestToken } from "@/lib/commerce";
import { wordpressPlugin, zipSingleFile } from "@/lib/install-guide";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const origin = process.env.APP_URL || new URL(request.url).origin;
  const src = `${origin}/api/embed?k=${makeIngestToken(user.id)}`;

  let site = "";
  try {
    const { data: scan } = await supabase.from("scans").select("final_url, url")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    site = scan ? hostOf(scan) : "";
  } catch {}

  // A .zip, not the raw .php: WordPress's plugin uploader accepts nothing else,
  // and the file must sit inside a folder for WordPress to read it as a plugin.
  const zip = zipSingleFile("marketing-genie/marketing-genie.php", wordpressPlugin({ src, site }));

  return new Response(zip, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="marketing-genie.zip"',
      "Content-Length": String(zip.length),
      // The tag inside is user-specific, so this must never be cached or shared.
      "Cache-Control": "no-store, private",
    },
  });
}
