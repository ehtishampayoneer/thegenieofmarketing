// app/api/embed/route.js
// ── THE ONE SNIPPET ──
// Serves the small script the owner pastes into their OWN website, once:
//
//   <script src="https://<app>/api/embed?k=<token>" async></script>
//
// It does three jobs, all of them Genie's actual job (find or convince a buyer,
// then hand them to where the deal closes — never taking payment itself):
//
//   1. Counts real visits, so "traffic today" is a first-party number that works
//      on day one with no Google Analytics connection.
//   2. Catches visitors who liked what they saw but weren't ready to buy, and
//      drops them into the owner's notifications as a lead to reply to.
//   3. Points people at the money page (pricing / packages / contact form),
//      UTM-tagged, so a sale traces back to the effort that earned it.
//
// Design rules, because this runs on someone else's site:
//   • Never break their page. Everything is wrapped, all failures are silent.
//   • No dependencies, no framework, no cookies, no personal data collected.
//   • Respects prefers-reduced-motion and prefers-color-scheme.
//   • The prompt appears ONCE per visitor, is dismissible, and stays dismissed.
//   • If the owner has not set a money page, the CTA is simply omitted rather
//     than guessing at a URL.

import { createAdminClient } from "@/lib/supabase/admin";
import { userFromToken } from "@/lib/onsite";
import { taggedLink } from "@/lib/attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const k = q.get("k") || "";
  const userId = userFromToken(k);

  // An invalid token must still return valid, harmless JavaScript. Returning an
  // error here would put a console error on a customer's live site.
  if (!userId) return js("/* Marketing Genie: this embed key is not valid. */");

  const appUrl = process.env.APP_URL || new URL(request.url).origin;

  // What should the CTA say, and where should it send people? Both come from
  // the owner's own settings; nothing is invented.
  let money = null, company = "", offer = "";
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("profiles")
      .select("money_page_url, company_name, company_pitch")
      .eq("id", userId).maybeSingle();
    if (data?.money_page_url) {
      money = taggedLink(data.money_page_url, { channel: "onsite", campaign: "genie-embed" });
    }
    company = data?.company_name || "";
    offer = data?.company_pitch || "";
  } catch {}

  const cfg = {
    k,
    endpoint: appUrl,
    money,
    // Kept short and honest. The owner can override both via data- attributes.
    title: company ? `Want this for ${company}?` : "Want to hear more?",
    body: offer ? String(offer).slice(0, 140) : "Leave your email and we'll get straight back to you.",
    cta: money ? "See pricing" : null,
  };

  return js(script(cfg));
}

function js(body) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Short cache: the owner can change their money page and see it reflected
      // the same day, without us re-serving this on every single pageview.
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── The client script ────────────────────────────────────────────────────────
// Written as one IIFE, no build step, small enough to read in full. Everything
// the server decided is injected as a frozen config object.
function script(cfg) {
  return `/* Marketing Genie — on-site layer. Counts visits, catches leads, points buyers
   at your money page. No cookies, no personal data, never blocks your page. */
(function () {
  "use strict";
  var C = ${JSON.stringify(cfg)};
  var W = window, D = document;
  if (W.__genieLoaded) return;           // never run twice
  W.__genieLoaded = true;

  var LS = "mg_lead_done", SS = "mg_sid";

  function store(kind, key, val) {
    try { var s = kind === "s" ? W.sessionStorage : W.localStorage;
      if (val === undefined) return s.getItem(key);
      s.setItem(key, val); return val;
    } catch (e) { return null; }         // private mode / blocked storage
  }

  // Tab-scoped id so five pages from one person don't read as five people.
  // Dies with the tab. Never leaves the visitor's browser except as this id.
  function sid() {
    var v = store("s", SS);
    if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); store("s", SS, v); }
    return v;
  }

  function send(path, payload, beacon) {
    var url = C.endpoint + path;
    var data = JSON.stringify(Object.assign({ k: C.k }, payload));
    try {
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([data], { type: "application/json" }));
        return Promise.resolve({ ok: true });
      }
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: data, keepalive: true })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); });
    } catch (e) { return Promise.resolve({ ok: false }); }
  }

  // ── 1. Count the visit ─────────────────────────────────────────────────────
  function view() {
    send("/api/px/view", { url: location.href, referrer: D.referrer || null, sid: sid() }, true);
  }

  // Single-page sites change the URL without reloading, so count those too.
  var lastPath = location.pathname;
  function watchSpa() {
    ["pushState", "replaceState"].forEach(function (m) {
      var orig = history[m];
      if (typeof orig !== "function") return;
      history[m] = function () { var r = orig.apply(this, arguments); onNav(); return r; };
    });
    W.addEventListener("popstate", onNav);
  }
  function onNav() {
    setTimeout(function () {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      view();
    }, 0);
  }

  // ── 2. Catch the visitor who isn't ready to buy ────────────────────────────
  var shown = false;
  function alreadyDone() { return store("l", LS) === "1"; }

  function open() {
    if (shown || alreadyDone()) return;
    shown = true;
    try { render(); } catch (e) { /* never break the host page */ }
  }

  function render() {
    var dark = false;
    try { dark = W.matchMedia && W.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) {}
    var calm = false;
    try { calm = W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

    var bg = dark ? "#1C1C1E" : "#FFFFFF";
    var fg = dark ? "#F5F5F7" : "#1D1D1F";
    var mut = dark ? "#AEAEB2" : "#6E6E73";
    var line = dark ? "#38383A" : "#D2D2D7";
    var blue = dark ? "#0A84FF" : "#0071E3";
    var field = dark ? "#2C2C2E" : "#F2F2F7";

    var box = D.createElement("div");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", C.title);
    box.style.cssText = [
      "position:fixed", "z-index:2147483000", "right:16px", "bottom:16px",
      "width:min(340px,calc(100vw - 32px))", "box-sizing:border-box",
      "background:" + bg, "color:" + fg, "border:1px solid " + line,
      "border-radius:14px", "padding:16px 16px 14px",
      "box-shadow:0 12px 40px rgba(0,0,0,.18)",
      "font:14px/1.45 -apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif",
      calm ? "" : "opacity:0;transform:translateY(8px);transition:opacity .28s ease,transform .28s ease"
    ].join(";");

    var moneyBtn = C.money && C.cta
      ? '<a href="' + esc(C.money) + '" style="display:inline-block;margin-top:10px;font-size:13px;color:' + blue + ';text-decoration:none;font-weight:600">' + esc(C.cta) + ' &rarr;</a>'
      : "";

    box.innerHTML =
      '<button type="button" aria-label="Close" data-mg="x" style="position:absolute;top:8px;right:10px;background:none;border:none;color:' + mut + ';font-size:19px;line-height:1;cursor:pointer;padding:4px">&times;</button>' +
      '<div style="font-weight:600;font-size:15px;padding-right:20px">' + esc(C.title) + '</div>' +
      '<div style="color:' + mut + ';font-size:13px;margin-top:5px">' + esc(C.body) + '</div>' +
      '<form data-mg="form" style="margin-top:11px;display:flex;gap:7px">' +
        '<input data-mg="hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px" />' +
        '<input data-mg="email" type="email" required placeholder="you@company.com" aria-label="Your email" style="flex:1;min-width:0;padding:9px 11px;border-radius:9px;border:1px solid ' + line + ';background:' + field + ';color:' + fg + ';font:inherit;font-size:13px" />' +
        '<button type="submit" style="padding:9px 14px;border-radius:9px;border:none;background:' + blue + ';color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer">Send</button>' +
      '</form>' +
      '<div data-mg="msg" style="font-size:12px;color:' + mut + ';margin-top:7px;display:none"></div>' +
      moneyBtn;

    D.body.appendChild(box);
    if (!calm) requestAnimationFrame(function () { box.style.opacity = "1"; box.style.transform = "translateY(0)"; });

    function close() { try { box.remove(); } catch (e) {} }
    box.querySelector('[data-mg="x"]').addEventListener("click", function () {
      store("l", LS, "1");                // dismissed counts as answered
      close();
    });

    box.querySelector('[data-mg="form"]').addEventListener("submit", function (e) {
      e.preventDefault();
      var email = box.querySelector('[data-mg="email"]').value;
      var hp = box.querySelector('[data-mg="hp"]').value;
      var msg = box.querySelector('[data-mg="msg"]');
      msg.style.display = "block";
      msg.textContent = "Sending...";
      send("/api/px/lead", { email: email, hp: hp, url: location.href, referrer: D.referrer || null })
        .then(function (r) {
          if (r && r.ok) {
            store("l", LS, "1");
            msg.textContent = "Thanks. We'll be in touch shortly.";
            setTimeout(close, 2200);
          } else {
            msg.textContent = (r && r.error) || "That didn't send. Please try again.";
          }
        });
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // When to ask. Deliberately gentle: someone who has read for a while, or
  // scrolled halfway, or is heading for the tab bar. Never on arrival.
  function arm() {
    if (alreadyDone()) return;
    setTimeout(open, 30000);
    W.addEventListener("scroll", function onScroll() {
      var h = D.documentElement;
      var pct = (h.scrollTop || D.body.scrollTop) / ((h.scrollHeight || 1) - h.clientHeight || 1);
      if (pct > 0.5) { W.removeEventListener("scroll", onScroll); open(); }
    }, { passive: true });
    D.addEventListener("mouseout", function (e) {
      if (!e.relatedTarget && e.clientY <= 0) open();   // heading for the tab bar
    });
  }

  // ── 3. Any link the owner marks gets the money page + tracking ─────────────
  // <a data-genie="buy"> becomes a tracked link to the money page, so the owner
  // can point their own buttons at whatever they sell through today.
  function wireButtons() {
    if (!C.money) return;
    try {
      var els = D.querySelectorAll('[data-genie="buy"]');
      for (var i = 0; i < els.length; i++) els[i].setAttribute("href", C.money);
    } catch (e) {}
  }

  function boot() { try { view(); watchSpa(); wireButtons(); arm(); } catch (e) {} }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
`;
}
