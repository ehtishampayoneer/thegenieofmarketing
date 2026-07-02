// lib/business.js
// The logical "business" layer. Today a business == a scanned host, but this
// file is the ONLY place that assumption lives. When we later add a real
// `businesses` table (multiple domains per business, brand assets, team),
// we change the mapping here — not every component.

export function hostOf(urlOrScan) {
  const u =
    typeof urlOrScan === "string"
      ? urlOrScan
      : urlOrScan?.final_url || urlOrScan?.finalUrl || urlOrScan?.url || "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u || "";
  }
}

// Group a flat list of scans into distinct businesses.
// Scans are expected newest-first; the first seen per host is the latest.
export function businessesFromScans(scans = []) {
  const map = new Map();
  for (const s of scans) {
    const host = hostOf(s);
    if (!host) continue;
    const existing = map.get(host);
    if (!existing) {
      map.set(host, { id: host, host, latest: s, scanIds: [s.id], count: 1 });
    } else {
      existing.scanIds.push(s.id);
      existing.count += 1;
    }
  }
  return [...map.values()];
}

// A friendly display name for a business (falls back to host).
export function businessName(business, scan) {
  const ai = (scan || business?.latest)?.ai;
  return ai?.businessName || business?.host || "your business";
}

export function businessLabel(host) {
  return host;
}
