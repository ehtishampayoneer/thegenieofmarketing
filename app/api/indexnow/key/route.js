// app/api/indexnow/key/route.js
// Serves the IndexNow key so search engines can verify we own this host (the
// keyLocation referenced in lib/indexnow). Public, plain text; 404 until the
// INDEXNOW_KEY env var is set (the feature is a no-op without it).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new Response("Not configured", { status: 404 });
  return new Response(key, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
