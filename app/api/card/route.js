// app/api/card/route.js
// ── BRANDED SOCIAL CARD (free, on-brand, composed server-side) ──
// Turns a product photo + a hook + the business's name/handle/colour into a clean,
// designed post image (Satori via next/og — no external service, no cost). Used for
// social posts so they look designed instead of a bare photo. Robust: if the photo
// can't be embedded (unsupported format / fetch fails), it renders a branded card on
// a solid brand background instead of erroring, so the <img> never breaks.

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HEX = /^#?[0-9a-fA-F]{6}$/;
const clampHex = (c, d) => (c && HEX.test(c) ? (c[0] === "#" ? c : "#" + c) : d);

// Fetch the photo and inline it as a data URI, but only for formats Satori renders
// reliably (jpeg/png). webp/avif/failed → null, and we fall back to a brand panel.
async function inlinePhoto(url) {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "GenieCard/1.0" }, signal: AbortSignal.timeout(6000) });
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!r.ok || !/image\/(jpeg|jpg|png)/.test(ct)) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 5_000_000) return null;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${ct.split(";")[0]};base64,${btoa(bin)}`;
  } catch { return null; }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") || "").slice(0, 90);
  const name = (searchParams.get("name") || "Your brand").slice(0, 32);
  const handle = (searchParams.get("handle") || "").slice(0, 32);
  const brand = clampHex(searchParams.get("brand"), "#F5A623");
  const wide = searchParams.get("ratio") === "wide";
  const W = wide ? 1200 : 1080;
  const H = wide ? 630 : 1080;
  const photoH = Math.round(H * (wide ? 0.56 : 0.6));
  const pad = wide ? 44 : 56;
  const headlineSize = wide ? 46 : 58;

  const photo = await inlinePhoto(searchParams.get("img"));
  const initial = (name.trim()[0] || "•").toUpperCase();

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#FAF7F2", fontFamily: "sans-serif" }}>
        {/* photo (or branded panel) */}
        <div style={{ display: "flex", width: "100%", height: photoH, overflow: "hidden", position: "relative", background: brand, alignItems: "center", justifyContent: "center" }}>
          {photo
            ? <img src={photo} width={W} height={photoH} style={{ objectFit: "cover" }} />
            : <div style={{ display: "flex", fontSize: 260, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>{initial}</div>}
        </div>
        {/* caption */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: pad, position: "relative", justifyContent: "space-between" }}>
          <div style={{ position: "absolute", left: 0, top: pad, width: 10, height: headlineSize * 1.8, background: brand, borderRadius: 5 }} />
          <div style={{ display: "flex", fontSize: headlineSize, fontWeight: 800, color: "#1A1A1A", lineHeight: 1.12, letterSpacing: "-0.5px", paddingLeft: 28, maxWidth: W - pad * 2 }}>{title}</div>
          <div style={{ display: "flex", alignItems: "center", paddingLeft: 28 }}>
            <div style={{ display: "flex", width: 60, height: 60, borderRadius: 16, background: "#1A1A1A", color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800 }}>{initial}</div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#1A1A1A" }}>{name}</div>
              {handle ? <div style={{ display: "flex", fontSize: 24, color: "#8B8680" }}>{handle}</div> : null}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "public, max-age=86400, immutable" } }
  );
}
