// lib/pages.js
// ── GENIE PAGES (hosted publishing) ──
// Turns an approved article into a REAL, public, indexable URL for any business —
// no WordPress required. Publishing writes one row (owner-scoped, via the user's
// client); the public /p routes read it back via the service-role admin client so
// anonymous visitors + Google/AI crawlers can load it. This is what makes
// "Approve" reliably become "it's live" for everyone, not just WordPress users.

export function handleFor(host) {
  return String(host || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9.-]/g, "")
    .slice(0, 80) || "site";
}

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "post";
}

export function appBase() {
  return String(process.env.APP_URL || "https://thegenieofmarketing.vercel.app").replace(/\/+$/, "");
}
export function pageUrl(handle, slug) {
  return `${appBase()}/p/${handle}/${slug}`;
}

// Publish a hosted page. Runs as the OWNER (RLS-scoped client), guaranteeing a
// unique (handle, slug). Returns the real public URL.
export async function publishHostedPage(supabase, {
  userId, host, actionId = null, title, bodyHtml, metaDescription = "",
  heroImage = null, heroAlt = null, targetKeyword = null,
  businessName = null, businessUrl = null, slug = null, faq = null,
}) {
  if (!bodyHtml || !title) throw new Error("hosted_publish_missing_content");
  const handle = handleFor(host);
  const base = slugify(slug || title);

  // De-collide the slug within this handle (own rows are visible under RLS).
  let finalSlug = base;
  for (let i = 2; i <= 25; i++) {
    const { data: exists } = await supabase.from("published_pages")
      .select("id").eq("handle", handle).eq("slug", finalSlug).maybeSingle();
    if (!exists) break;
    finalSlug = `${base}-${i}`;
  }

  const row = {
    user_id: userId, action_id: actionId, host, handle, slug: finalSlug,
    title, body_html: bodyHtml, meta_description: metaDescription || null,
    hero_image: heroImage || null, hero_alt: heroAlt || null, target_keyword: targetKeyword || null,
    business_name: businessName || null, business_url: businessUrl || null,
    faq: Array.isArray(faq) && faq.length ? faq : null,
    status: "published",
  };

  let { data, error } = await supabase.from("published_pages").insert(row).select("id, handle, slug").maybeSingle();
  // A cross-user (handle, slug) clash still trips the unique constraint — retry once
  // with a short random suffix rather than failing the publish.
  if (error) {
    row.slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    ({ data, error } = await supabase.from("published_pages").insert(row).select("id, handle, slug").maybeSingle());
  }
  if (error || !data) throw new Error(error?.message || "hosted_publish_failed");
  return { id: data.id, handle: data.handle, slug: data.slug, url: pageUrl(data.handle, data.slug) };
}

// Public reads (service-role/admin client — bypasses RLS, published rows only).
export async function getPublishedPage(admin, handle, slug) {
  try {
    const { data } = await admin.from("published_pages").select("*")
      .eq("handle", handle).eq("slug", slug).eq("status", "published").maybeSingle();
    return data || null;
  } catch { return null; }
}
export async function listPublishedPages(admin, handle, limit = 60) {
  try {
    const { data } = await admin.from("published_pages")
      .select("slug, title, meta_description, published_at, business_name, business_url, host")
      .eq("handle", handle).eq("status", "published")
      .order("published_at", { ascending: false }).limit(limit);
    return data || [];
  } catch { return []; }
}
