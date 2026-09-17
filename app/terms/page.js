// app/terms/page.js
// Public terms of service, linked from the Google consent screen and login.

import Link from "next/link";

export const metadata = {
  title: "Terms of Service · Marketing Genie",
  description: "The terms for using Marketing Genie.",
};

const UPDATED = "17 September 2026";
const CONTACT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";

export default function TermsPage() {
  return (
    <main style={{ background: "var(--bg)", color: "var(--fg)", minHeight: "100vh" }}>
      <article style={{ maxWidth: "72ch", margin: "0 auto", padding: "56px 22px 80px", lineHeight: 1.65, fontSize: 16 }}>
        <p className="text-[13px] mg-subtle"><Link href="/login">Marketing Genie</Link></p>
        <h1 className="mg-display" style={{ fontSize: "clamp(30px,4vw,42px)", marginTop: 10 }}>Terms of Service</h1>
        <p className="mg-subtle text-[14px]" style={{ marginTop: 6 }}>Last updated {UPDATED}</p>

        <Section title="The service">
          <p>Marketing Genie reads your website, suggests keywords, finds possible customers and opportunities, and drafts content and outreach. By using it you agree to these terms.</p>
        </Section>
        <Section title="You stay in control">
          <p>Genie drafts; you decide. You are responsible for what you publish and send through Genie, including making sure it is accurate and that your outreach follows the laws that apply to you, such as anti-spam and data-protection rules.</p>
        </Section>
        <Section title="Acceptable use">
          <p>Do not use Genie to send spam, to mislead people, to impersonate anyone, to make claims you cannot support, or to break any law or any platform&apos;s rules. We may suspend accounts that do.</p>
        </Section>
        <Section title="AI output">
          <p>Drafts are written by AI and can be wrong. Review them before you use them. Results such as rankings, traffic, replies or sales are not guaranteed.</p>
        </Section>
        <Section title="Connected accounts">
          <p>When you connect Google or your website, you allow Genie to use them only as described in the <Link href="/privacy">Privacy Policy</Link>. You can disconnect at any time.</p>
        </Section>
        <Section title="Availability and liability">
          <p>Genie is provided as is. We work to keep it running and accurate, but we are not liable for indirect losses, lost profits, or the consequences of content you chose to publish or send, to the extent the law allows.</p>
        </Section>
        <Section title="Changes and contact">
          <p>We may update these terms; the date above will change when we do.{CONTACT ? <> Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : ""}</p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 8 }}>{title}</h2>
      <div className="legal-body">{children}</div>
    </section>
  );
}
