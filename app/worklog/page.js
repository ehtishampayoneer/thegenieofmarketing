"use client";

// ── EVERYTHING GENIE DID ──
// The screen that makes a beginner still be here in week three.
//
// Results take weeks and nobody waits weeks for something they cannot see
// working. Proof of WORK is available on day two: three emails went to these
// three named companies, here is your article, live, at this address.
//
// It also fixes a real bug. A published article's URL appeared in exactly one
// place — a temporary list on Approvals that held six items and emptied on
// refresh — so the owner had an article on the internet and no way to find it.
//
// Three rules it keeps, and each one is a decision this product already made:
//   · Every line links to the real thing, in an account the owner owns. That is
//     the strongest thing Genie can say and it costs nothing, because it was
//     already true: email leaves from their Gmail, articles publish to their
//     site, community posts are ones they pressed post on themselves.
//   · Every number carries one line of plain English. "12 visits" frightens
//     someone who does not know a new article takes months.
//   · What is coming names only what GENIE will do. Never what a stranger will
//     do — this product stopped promising other people's behaviour on purpose.

import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { DataStateBadge, EmptyState, LoadingState } from "@/components/ui/v2/DataState";
import { relTime } from "@/lib/live";
import { useLive } from "@/lib/useLive";

// One icon and one word per kind. No colour coding: colour here would imply good
// and bad, and "emailed someone" is neither.
const KIND = {
  published: { icon: Icon.write, word: "Published" },
  email: { icon: Icon.mail, word: "Emailed" },
  followup: { icon: Icon.mail, word: "Followed up" },
  reply: { icon: Icon.inbox, word: "Reply" },
  post: { icon: Icon.conversations, word: "Posted" },
  rank: { icon: Icon.growth, word: "Google" },
  lead: { icon: Icon.bolt, word: "Lead" },
  sale: { icon: Icon.coins, word: "Sale" },
  link: { icon: Icon.link, word: "Link" },
  // Three ways a piece of work can end without reaching anyone. Each one used to
  // exist only as a toast, which is how "I pressed publish and cannot find it"
  // became a question with no answer anywhere in the product.
  discarded: { icon: Icon.write, word: "Thrown away" },
  failed: { icon: Icon.bolt, word: "Did not publish" },
  held: { icon: Icon.check, word: "Waiting on you" },
};

export default function WorklogPage() {
  const { data: d, state } = useLive("/api/worklog", (j) => !(j.items?.length));
  const items = d?.items || [];

  return (
    <OperatorShell active="worklog">
      <OperatorHeader
        icon={Icon.tasks}
        label="Everything Genie did"
        provenance={<DataStateBadge state={state} />}
        title="Here is the work,"
        accent="with a link to each of it."
        kicker={d?.trust}
      />

      {state === "disconnected" ? (
        <EmptyState state="disconnected" icon={Icon.tasks} title="I can’t reach your work log" sub="Sign in and I’ll show you everything I’ve done." />
      ) : state === "loading" || !d ? (
        <LoadingState rows={5} />
      ) : (
        <>
          <Totals t={d.totals} />

          {items.length === 0 ? (
            <Card className="mt-5 p-8 text-center">
              <p className="mg-title" style={{ fontSize: 19 }}>Nothing to show yet</p>
              <p className="mt-1.5 text-[14px] mg-muted max-w-md mx-auto">
                The first article, the first email and the first conversation all land here the morning after Genie starts. Every line will link to the real thing.
              </p>
              <a href="/approvals" className="mg-btn mg-btn--dawn mt-4 inline-flex">Go to Approvals →</a>
            </Card>
          ) : (
            <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
              <div className="flex flex-col gap-2.5">
                {items.map((it, i) => <Row key={`${it.kind}-${it.at}-${i}`} it={it} />)}
              </div>
              <NextUp next={d.next} />
            </div>
          )}
        </>
      )}
    </OperatorShell>
  );
}

// ── RUNNING TOTALS ───────────────────────────────────────────────────────────
// Progress stays visible even while results are zero, which is most of week one.
function Totals({ t }) {
  if (!t) return null;
  const cells = [
    ["Articles", t.articles], ["Emails", t.emails], ["Replies", t.replies],
    ["Conversations", t.conversations], ["Visits", t.visits], ["Leads", t.leads],
  ];
  if (t.sales > 0) cells.push(["Sales", t.sales]);
  return (
    <Card className="mt-5 p-5">
      <p className="mg-eyebrow">Since you started</p>
      <div className="mt-3 flex flex-wrap gap-x-9 gap-y-4">
        {cells.map(([label, v]) => (
          <div key={label}>
            <p className="mg-num" style={{ fontSize: 24, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{v ?? 0}</p>
            <p className="text-[12.5px] mg-muted">{label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── ONE THING THAT HAPPENED ──────────────────────────────────────────────────
function Row({ it }) {
  const k = KIND[it.kind] || { icon: Icon.check, word: "Did" };
  const I = k.icon;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="mg-tile" style={{ width: 34, height: 34, flex: "none" }}><I size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="mg-eyebrow" style={{ margin: 0 }}>{k.word}</span>
            <span className="text-[12px] mg-subtle">{relTime(it.at)}</span>
            {it.first && (
              <span className="text-[11px]" style={{ padding: "2px 7px", borderRadius: 4, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}>
                your first
              </span>
            )}
            {it.meta && <span className="text-[12.5px] mg-muted">· {it.meta}</span>}
          </div>

          <p className="mt-1 text-[15px] font-semibold" style={{ color: "var(--fg)" }}>{it.title}</p>
          {it.sub && <p className="mt-0.5 text-[13.5px] mg-muted truncate">{it.sub}</p>}

          {/* WHY Genie did it. The approval card explained the choice, and then the
              explanation died with the card — so a week later this page was a list of
              things that had happened and no clue what any of them was for. An owner
              who cannot see the reasoning has no way to tell work from activity. */}
          {it.why && (
            <p className="mt-1.5 text-[13px] flex items-start gap-1.5" style={{ maxWidth: "var(--measure)", color: "var(--fg-muted)" }}>
              <span aria-hidden style={{ flex: "none" }}>↳</span>
              <span><b style={{ color: "var(--fg)", fontWeight: 600 }}>Why:</b> {it.why}</span>
            </p>
          )}

          {/* Every number gets a sentence. A bare "12 visits" reads as failure to
              someone who does not know what a new article normally does. */}
          {it.note && <p className="mt-1.5 text-[13px] mg-muted" style={{ maxWidth: "var(--measure)" }}>{it.note}</p>}

          {/* ── READ WHAT ACTUALLY WENT OUT ──
              An owner could see that forty emails had been sent and could not read
              one of them. Closed by default, because the point of this page is to
              skim; open on demand, because the point of trusting it is to check. */}
          {it.body && (
            <details className="mt-2">
              <summary className="text-[13px] font-semibold cursor-pointer" style={{ color: "var(--accent-ink)" }}>
                Read the email that was sent
              </summary>
              <div className="mt-2 rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
                {it.to && <p className="text-[12px] mg-subtle">To: {it.to}</p>}
                {it.sub && <p className="text-[12.5px] font-semibold mt-0.5" style={{ color: "var(--fg)" }}>{it.sub}</p>}
                <p className="mt-2 text-[13px] whitespace-pre-wrap" style={{ color: "var(--fg-muted)", maxWidth: "var(--measure)" }}>{it.body}</p>
              </div>
            </details>
          )}

          <div className="mt-2 flex items-center gap-3 flex-wrap">
            {it.url && (
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold" style={{ color: "var(--accent-ink)" }}>
                {it.linkLabel || "Open it"} ↗
              </a>
            )}
            {/* The trust line, per item: go and check somewhere Genie does not own. */}
            {it.where && <span className="text-[12.5px] mg-subtle">{it.where}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── WHAT GENIE WILL DO NEXT ──────────────────────────────────────────────────
// Actions only. Never "replies will come" — that is a promise about strangers,
// and it is the promise this product deliberately stopped making.
function NextUp({ next }) {
  if (!next?.length) return null;
  return (
    <Card className="p-5 xl:sticky" style={{ top: 18 }}>
      <p className="mg-eyebrow">What I’ll do next</p>
      <ul className="mt-3 flex flex-col gap-3">
        {next.map((line, i) => (
          <li key={i} className="text-[13.5px]" style={{ color: "var(--fg-soft)", lineHeight: 1.5 }}>{line}</li>
        ))}
      </ul>
      <p className="mt-4 text-[12px] mg-subtle" style={{ lineHeight: 1.5 }}>
        These are things I do on my own. I can’t promise when someone replies, so I don’t.
      </p>
    </Card>
  );
}
