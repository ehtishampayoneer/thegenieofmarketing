"use client";

// components/report.js
// Shared report renderer — used by both the live homepage scan and the
// saved-scan detail view (/dashboard/scan/[id]).

function SinceLastScan({ c }) {
  const up = c.delta > 0;
  const flat = c.delta === 0;
  const when = (() => {
    try {
      return new Date(c.prevDate).toLocaleDateString(undefined, {
        month: "short", day: "numeric",
      });
    } catch {
      return "last time";
    }
  })();
  return (
    <div className="mt-5 bg-white border border-genie-purple/20 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-genie-purple">
          Since your last scan · {when}
        </p>
        <span
          className="text-sm font-bold"
          style={{ color: up ? "#059669" : flat ? "#6B7280" : "#EF4444" }}
        >
          {c.prevScore} → {c.newScore} ({c.delta >= 0 ? "+" : ""}{c.delta})
        </span>
      </div>
      {c.improved?.length > 0 && (
        <p className="mt-2 text-sm text-emerald-700">
          ✓ Fixed: {c.improved.join(", ")}
        </p>
      )}
      {c.regressed?.length > 0 && (
        <p className="mt-1 text-sm text-red-600">
          △ Slipped: {c.regressed.join(", ")}
        </p>
      )}
      {(!c.improved || c.improved.length === 0) &&
        (!c.regressed || c.regressed.length === 0) && (
          <p className="mt-2 text-sm text-genie-ink/55">
            No individual checks changed since last time — steady.
          </p>
        )}
    </div>
  );
}

export function Report({ data, loggedIn, saved, comparison }) {
  const { scores, ai, checks, finalUrl, speed, speedAvailable, accuracy, gsc } = data;
  const label = scoreLabel(scores.overall);

  return (
    <section className="flex-1 px-6 pb-10">
      <div className="max-w-3xl mx-auto">
        {/* Score header */}
        <div className="text-center mt-2">
          <Ring value={scores.overall} />
          <p className="mt-2 text-lg font-semibold" style={{ color: label.color }}>
            {label.text}
          </p>
          <p className="text-sm text-genie-ink/50 break-all">{prettyHost(finalUrl)}</p>
        </div>

        {comparison && <SinceLastScan c={comparison} />}

        {!loggedIn && (
          <div className="mt-4 bg-genie-mist border border-genie-ink/10 rounded-xl p-3 text-center text-sm">
            <a href="/login" className="text-genie-purple font-medium hover:underline">
              Sign in
            </a>
            <span className="text-genie-ink/60">
              {" "}to save this report and track your score over time.
            </span>
          </div>
        )}
        {loggedIn && saved && (
          <p className="mt-3 text-center text-sm text-emerald-600">
            ✓ Saved to your history
          </p>
        )}

        {/* Sub-scores */}
        <div className="mt-8 grid sm:grid-cols-2 gap-3">
          <Bar label="🔍 SEO & Visibility" value={scores.seo} />
          <Bar label="⚡ Speed" value={scores.speed} />
          <Bar label="🛡️ Trust" value={scores.trust} />
          <Bar label="🔧 Technical" value={scores.technical} />
          <Bar label="👥 Social" value={scores.social} />
        </div>

        {/* Speed metrics */}
        {speed && (
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            <Metric label="Load (LCP)" value={speed.lcpSec != null ? speed.lcpSec + "s" : "—"} />
            <Metric label="Stability (CLS)" value={speed.cls != null ? speed.cls : "—"} />
            <Metric label="Speed" value={speed.performance + "/100"} />
          </div>
        )}
        {!speedAvailable && (
          <p className="mt-3 text-center text-xs text-genie-ink/40">
            ⚡ Speed score pending — add a PageSpeed key to measure real load time.
          </p>
        )}

        {/* Business profile + summary */}
        {accuracy && <AccuracyBar accuracy={accuracy} />}

        {gsc?.available && <GscPanel gsc={gsc} />}

        {ai && <BusinessBrain ai={ai} gsc={gsc} />}

        {/* Top fixes */}
        {ai?.topFixes?.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-genie-ink mb-3">
              🔥 Your highest-impact fixes
            </h2>
            <div className="space-y-3">
              {ai.topFixes.map((f, i) => (
                <FixCard key={i} fix={f} n={i + 1} />
              ))}
            </div>
          </div>
        )}

        {/* Full checklist */}
        <details className="mt-8 group">
          <summary className="cursor-pointer text-genie-purple font-medium">
            See all {checks.length} checks
          </summary>
          <div className="mt-3 space-y-1">
            {checks.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-3 bg-white border border-genie-ink/10 rounded-lg px-4 py-3"
              >
                <span className="mt-0.5">{statusIcon(c.status)}</span>
                <div className="flex-1">
                  <p className="font-medium text-genie-ink text-sm">{c.label}</p>
                  <p className="text-sm text-genie-ink/60">{c.detail}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.status !== "pass" && c.difficulty && (
                      <Chip tone={difficultyTone(c.difficulty)}>{c.difficulty}</Chip>
                    )}
                    {c.status !== "pass" && c.timeToFix && c.timeToFix !== "—" && (
                      <Chip>🕒 {c.timeToFix}</Chip>
                    )}
                    {c.impactEstimate && (
                      <Chip tone="emerald">▲ {c.impactEstimate} est.</Chip>
                    )}
                    {c.confidence != null && (
                      <Chip tone="muted">{c.confidence}% confidence</Chip>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>

        <p className="mt-6 text-center text-xs text-genie-ink/40">
          Powered by Genie AI
        </p>
      </div>
    </section>
  );
}

function Ring({ value }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = scoreLabel(value).color;
  return (
    <div className="relative inline-block">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#E5E7EB" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold text-genie-ink">{value}</span>
        <span className="text-xs text-genie-ink/50">/ 100</span>
      </div>
    </div>
  );
}

function Bar({ label, value }) {
  if (value === null || value === undefined) return null;
  const color = scoreLabel(value).color;
  return (
    <div className="bg-white border border-genie-ink/10 rounded-xl px-4 py-3">
      <div className="flex justify-between text-sm font-medium text-genie-ink">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-genie-ink/10 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: color, transition: "width 1s ease" }}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-white border border-genie-ink/10 rounded-lg px-3 py-2 text-center">
      <div className="text-xs text-genie-ink/50">{label}</div>
      <div className="text-sm font-semibold text-genie-ink">{value}</div>
    </div>
  );
}

function AccuracyBar({ accuracy }) {
  const { percent, sources } = accuracy;
  const meta = {
    verified: { tone: "green", icon: "✓", word: "Verified" },
    estimated: { tone: "amber", icon: "≈", word: "Estimated" },
    missing: { tone: "muted", icon: "○", word: "Not connected" },
  };
  return (
    <div className="mt-8 bg-white border border-genie-ink/10 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-genie-purple">Genie accuracy</p>
        <span className="text-lg font-extrabold text-genie-ink">{percent}%</span>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-genie-ink/10 overflow-hidden">
        <div
          className="h-full genie-gradient"
          style={{ width: `${percent}%`, transition: "width 1s ease" }}
        />
      </div>
      <p className="mt-2 text-sm text-genie-ink/55">
        Genie is working with partial data. Connecting your accounts raises accuracy
        and swaps estimates for exact numbers.
      </p>
      <div className="mt-4 space-y-2">
        {sources.map((s) => {
          const m = meta[s.status];
          return (
            <div key={s.key} className="flex items-center gap-3">
              <Chip tone={m.tone}>
                {m.icon} {m.word}
              </Chip>
              <span className="text-sm text-genie-ink/75 flex-1">{s.label}</span>
              {s.status === "missing" && s.unlock && (
                <span className="text-xs font-medium text-genie-purple/70 whitespace-nowrap">
                  {s.unlock} · +{s.gain}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BusinessBrain({ ai, gsc }) {
  const has = (v) => v && (Array.isArray(v) ? v.length > 0 : String(v).trim());
  const realKw = gsc?.available ? gsc.topQueries.slice(0, 8) : null;
  const subtitle = [ai.industry, ai.subCategory].filter(has).join(" · ");
  const metaLine = [ai.businessType, ai.primaryMarket && `${ai.primaryMarket} (est.)`]
    .filter(has)
    .join(" · ");

  return (
    <div className="mt-8 bg-white border border-genie-ink/10 rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-semibold text-genie-purple">What Genie sees</p>

      {has(ai.businessName) && (
        <p className="mt-2 text-lg font-bold text-genie-ink">{ai.businessName}</p>
      )}
      {has(subtitle) && <p className="text-sm text-genie-ink/60">{subtitle}</p>}
      {has(metaLine) && <p className="text-sm text-genie-ink/50 mt-0.5">{metaLine}</p>}
      {has(ai.summary) && (
        <p className="mt-3 text-genie-ink/80 leading-relaxed">{ai.summary}</p>
      )}

      <div className="mt-5 grid sm:grid-cols-2 gap-5">
        {has(ai.targetCustomer) && (
          <Section title="Target customer">
            <p className="text-sm text-genie-ink/75">{ai.targetCustomer}</p>
          </Section>
        )}

        {ai.brandVoice && (has(ai.brandVoice.tone) || has(ai.brandVoice.note)) && (
          <Section title="Brand voice">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {has(ai.brandVoice.tone) && <Chip tone="default">{ai.brandVoice.tone}</Chip>}
              {has(ai.brandVoice.formality) && (
                <Chip tone="muted">{ai.brandVoice.formality}</Chip>
              )}
            </div>
            {has(ai.brandVoice.note) && (
              <p className="text-sm text-genie-ink/75">{ai.brandVoice.note}</p>
            )}
          </Section>
        )}

        {has(ai.strengths) && (
          <Section title="Strengths">
            <ul className="space-y-1">
              {ai.strengths.map((s, i) => (
                <li key={i} className="text-sm text-genie-ink/75 flex gap-2">
                  <span className="text-emerald-600">✓</span> {s}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {has(ai.weaknesses) && (
          <Section title="Weaknesses">
            <ul className="space-y-1">
              {ai.weaknesses.map((w, i) => (
                <li key={i} className="text-sm text-genie-ink/75 flex gap-2">
                  <span className="text-amber-600">△</span> {w}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {realKw && realKw.length > 0 ? (
        <Section title="Keywords you rank for" verified className="mt-5">
          <div className="flex flex-wrap gap-1.5">
            {realKw.map((k, i) => (
              <Chip key={i} tone="green">
                {k.query} · #{Math.round(k.position)}
              </Chip>
            ))}
          </div>
        </Section>
      ) : (
        has(ai.keywordsToOwn) && (
          <Section title="Keywords to own" est className="mt-5">
            <div className="flex flex-wrap gap-1.5">
              {ai.keywordsToOwn.map((k, i) => (
                <Chip key={i} tone="default">{k}</Chip>
              ))}
            </div>
          </Section>
        )
      )}
      {realKw && realKw.length > 0 && has(ai.keywordsToOwn) && (
        <Section title="New keywords to target" est className="mt-5">
          <div className="flex flex-wrap gap-1.5">
            {ai.keywordsToOwn.map((k, i) => (
              <Chip key={i} tone="default">{k}</Chip>
            ))}
          </div>
        </Section>
      )}

      {has(ai.competitors) && (
        <Section title="Likely competitors" est className="mt-5">
          <ul className="space-y-1.5">
            {ai.competitors.map((c, i) => (
              <li key={i} className="text-sm text-genie-ink/75">
                <span className="font-medium text-genie-ink">{c.name}</span>
                {has(c.why) && <span className="text-genie-ink/55"> — {c.why}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children, est, verified, className = "" }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-genie-ink/45 mb-1.5">
        {title}
        {est && (
          <span className="ml-1.5 normal-case tracking-normal text-genie-purple/60 font-medium">
            · estimated
          </span>
        )}
        {verified && (
          <span className="ml-1.5 normal-case tracking-normal text-emerald-600 font-medium">
            · verified
          </span>
        )}
      </p>
      {children}
    </div>
  );
}

function GscPanel({ gsc }) {
  const t = gsc.totals || {};
  return (
    <div className="mt-8 bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-emerald-700">
          Real Search Console data
        </p>
        <Chip tone="green">✓ verified</Chip>
      </div>
      <p className="text-xs text-genie-ink/50 mt-1">Last 28 days · {prettySite(gsc.site)}</p>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Clicks" value={fmt(t.clicks)} />
        <Metric label="Impressions" value={fmt(t.impressions)} />
        <Metric label="Avg CTR" value={`${t.ctr ?? 0}%`} />
        <Metric label="Avg position" value={t.position ?? "–"} />
      </div>

      {gsc.opportunities?.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-genie-ink/45 mb-2">
            🔥 Quick-win keyword opportunities
          </p>
          <div className="space-y-2">
            {gsc.opportunities.map((o, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm font-medium text-genie-ink">“{o.query}”</p>
                <p className="text-xs text-genie-ink/70 mt-0.5">
                  Seen {fmt(o.impressions)} times, ranking #{Math.round(o.position)}, but only{" "}
                  {o.ctr}% click. Improving your title/meta could capture far more of these.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {gsc.topQueries?.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-emerald-700 font-medium">
            Top {Math.min(gsc.topQueries.length, 25)} keywords
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-genie-ink/45 text-xs">
                  <th className="text-left font-medium pb-2">Keyword</th>
                  <th className="text-right font-medium pb-2">Clicks</th>
                  <th className="text-right font-medium pb-2">Impr.</th>
                  <th className="text-right font-medium pb-2">CTR</th>
                  <th className="text-right font-medium pb-2">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {gsc.topQueries.map((q, i) => (
                  <tr key={i} className="border-t border-genie-ink/5">
                    <td className="py-1.5 pr-2 text-genie-ink/80">{q.query}</td>
                    <td className="py-1.5 text-right text-genie-ink/70">{fmt(q.clicks)}</td>
                    <td className="py-1.5 text-right text-genie-ink/70">{fmt(q.impressions)}</td>
                    <td className="py-1.5 text-right text-genie-ink/70">{q.ctr}%</td>
                    <td className="py-1.5 text-right text-genie-ink/70">{Math.round(q.position)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function fmt(n) {
  if (n == null) return "–";
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}
function prettySite(s) {
  if (!s) return "";
  return s.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function FixCard({ fix, n }) {
  return (
    <div className="bg-white border border-genie-ink/10 rounded-2xl p-5 shadow-sm">
      <p className="font-semibold text-genie-ink">
        {n}. {fix.title}
      </p>
      {fix.whatItMeans && (
        <p className="mt-2 text-sm text-genie-ink/80">{fix.whatItMeans}</p>
      )}
      {fix.whatItCosts && (
        <p className="mt-2 text-sm text-genie-emerald font-medium">
          {fix.whatItCosts}
        </p>
      )}
      {fix.howToFix && (
        <p className="mt-2 text-sm text-genie-ink/60">
          <span className="font-medium text-genie-ink/80">How: </span>
          {fix.howToFix}
        </p>
      )}
    </div>
  );
}

function Chip({ children, tone = "default" }) {
  const tones = {
    default: "bg-genie-mist text-genie-ink/70 border-genie-ink/10",
    muted: "bg-genie-mist text-genie-ink/45 border-genie-ink/10",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span
      className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function difficultyTone(d) {
  if (d === "Easy") return "green";
  if (d === "Hard") return "red";
  return "amber";
}

function statusIcon(status) {
  if (status === "pass") return "✅";
  if (status === "warn") return "⚠️";
  return "❌";
}

function scoreLabel(v) {
  if (v >= 90) return { text: "Excellent", color: "#10B981" };
  if (v >= 75) return { text: "Good Progress", color: "#059669" };
  if (v >= 60) return { text: "Needs Attention", color: "#F59E0B" };
  if (v >= 40) return { text: "Significant Issues", color: "#F97316" };
  return { text: "Critical Problems", color: "#EF4444" };
}

function prettyHost(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}
