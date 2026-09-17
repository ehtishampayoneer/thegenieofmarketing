import { describe, it, expect } from "vitest";
import fs from "fs";

// The skip lists are module-private, so read them from source. Both used to be
// bare fragments that silently discarded real companies and publishers.
const grab = (file, name) => {
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(new RegExp(`const ${name} = (\/.*\/[a-z]*);`));
  return eval(m[1]);
};

describe("domain skip lists match whole domains only", () => {
  const prospects = grab("lib/prospects.js", "SKIP_HOST");
  const media = grab("lib/earned-media.js", "MEDIA_SKIP");
  it.each(["betsyfurniture.com", "sandbox.com", "mediumrare.com", "ruggingbox.com", "rugs.myshopify.com", "amazonrugs.com"])("keeps prospect %s", (d) => {
    expect(prospects.test(d)).toBe(false);
  });
  it.each(["amazon.co.uk", "www.etsy.com", "x.com", "shopify.com", "uk.indeed.com"])("skips platform %s", (d) => {
    expect(prospects.test(d)).toBe(true);
  });
  it.each(["vox.com", "netflix.com", "hubspot.com", "googleblog.com"])("keeps publisher %s", (d) => {
    expect(media.test(d)).toBe(false);
  });
  it.each(["m.facebook.com", "en.wikipedia.org", "t.co", "nasa.gov"])("skips %s", (d) => {
    expect(media.test(d)).toBe(true);
  });
});
