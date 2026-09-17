// app/privacy/page.js
// Public privacy policy. Google requires one before an OAuth app can be put in
// production, and it must describe what Genie actually does with Google data.
// Keep it TRUE: if a feature starts using data differently, change this page in
// the same commit. The Google section is the part Google's reviewers read.

import Link from "next/link";

export const metadata = {
  title: "Privacy Policy · Marketing Genie",
  description: "What Marketing Genie collects, why, who processes it, and how to delete it.",
};

const UPDATED = "17 September 2026";
const CONTACT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";

export default function PrivacyPage() {
  return (
    <main style={{ background: "var(--bg)", color: "var(--fg)", minHeight: "100vh" }}>
      <article style={{ maxWidth: "72ch", margin: "0 auto", padding: "56px 22px 80px", lineHeight: 1.65, fontSize: 16 }}>
        <p className="text-[13px] mg-subtle"><Link href="/login">Marketing Genie</Link></p>
        <h1 className="mg-display" style={{ fontSize: "clamp(30px,4vw,42px)", marginTop: 10 }}>Privacy Policy</h1>
        <p className="mg-subtle text-[14px]" style={{ marginTop: 6 }}>Last updated {UPDATED}</p>

        <Section title="Who we are">
          <p>Marketing Genie is an AI marketing assistant for business owners. It reads your website, finds people who may want what you sell, and drafts content and outreach for you to review. This policy explains what data it uses and why.</p>
        </Section>

        <Section title="What we collect">
          <ul>
            <li><b>Your account:</b> your email address and login details.</li>
            <li><b>Your business:</b> your website address, the public text Genie reads from it, and what you tell Genie about your business, customers, prices and goals.</li>
            <li><b>Your settings:</b> company name, sender name and email, logo, and the page you want buyers sent to.</li>
            <li><b>What Genie produces:</b> keywords, drafts, prospects, outreach history, and activity logs.</li>
            <li><b>Visitor data from your site,</b> only if you install the Genie snippet: page views, and the email address a visitor chooses to type into a form. No cookies are set by the snippet.</li>
          </ul>
        </Section>

        <Section title="Google data">
          <p>If you connect your Google account, Genie asks for these permissions. Each is used only for the feature listed.</p>
          <ul>
            <li><b>Your email address:</b> to show which account is connected and to send from it.</li>
            <li><b>Search Console (read only):</b> to see which searches your site appears for, and track keyword rankings.</li>
            <li><b>Google Analytics (read only):</b> to show your site traffic and which pages bring visitors.</li>
            <li><b>Google Ads:</b> to read real monthly search volumes from Keyword Planner. Genie does not create, change or pay for ads.</li>
            <li><b>Indexing:</b> to ask Google to crawl pages you publish through Genie.</li>
            <li><b>Send email (Gmail):</b> to send the outreach emails you approve, from your own address. Genie sends only emails it drafted for you, within a daily limit, and never on your behalf to anyone else.</li>
            <li><b>Read email (Gmail, read only):</b> to detect replies from people Genie emailed for you. Genie looks only for messages from those contacts, and stores the sender, subject and a short preview so the reply appears in your Genie inbox. It does not read, store or use any other email in your mailbox.</li>
          </ul>
          <p><b>Limited Use.</b> Marketing Genie&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Google data is used only to provide the features above to you. It is not sold, not used for advertising, and not read by people except when you ask us for support, when required for security, or when required by law. Marketing Genie does not use Google data to train AI models, and never sends Gmail data to any AI provider.</p>
          <p>You can disconnect Google at any time from the Connections page in Genie, or from your Google account at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</p>
        </Section>

        <Section title="Who processes your data">
          <p>We use these service providers to run Genie. Each receives only what its job needs.</p>
          <ul>
            <li><b>Supabase:</b> database and login.</li>
            <li><b>Vercel:</b> hosting.</li>
            <li><b>AI providers (Google Gemini, Groq, OpenRouter):</b> receive your business details, text from your website, what you tell Genie, and public material needed for a specific draft, such as a public forum post. When Genie writes an article for you, it may include the search terms your site already appears for in Search Console, only to write that article. <b>Nothing from your Gmail is ever sent to an AI provider:</b> replies are sorted with rules inside Genie itself.</li>
            <li><b>Resend:</b> sends system emails such as your daily brief.</li>
            <li><b>Search and page-fetch services:</b> Genie visits public websites and search results to find prospects and opportunities.</li>
          </ul>
        </Section>

        <Section title="People Genie contacts for you">
          <p>Genie finds business contact details published on companies&apos; own websites. Every outreach email includes an unsubscribe link, and anyone who unsubscribes is never emailed again by that account. You are responsible for the emails you choose to send.</p>
        </Section>

        <Section title="How long we keep data, and deleting it">
          <p>We keep your data while your account is active. You can wipe everything Genie has stored for your account at any time from the Diagnostics page (&quot;Full reset&quot;), disconnect Google from Connections, or ask us to delete your account entirely{CONTACT ? <> by emailing <a href={`mailto:${CONTACT}`}>{CONTACT}</a></> : ""}. Deleted data is removed from our database; backups held by our providers expire on their normal schedule.</p>
        </Section>

        <Section title="Security">
          <p>Data is encrypted in transit. Database access is restricted per account, and Google access tokens are stored server-side and never shown in the browser.</p>
        </Section>

        <Section title="Changes and contact">
          <p>If this policy changes, the date at the top changes too.{CONTACT ? <> Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : ""}</p>
          <p className="mg-subtle text-[14px]" style={{ marginTop: 18 }}><Link href="/terms">Terms of Service</Link></p>
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
