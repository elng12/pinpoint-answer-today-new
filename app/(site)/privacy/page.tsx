import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { formatStaticRouteLastUpdated } from "@/lib/site/static-page-metadata";
import { supportEmail, supportMailto } from "@/lib/site/config";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: "Privacy Notice | Pinpoint Answer Today",
    description:
      "Learn how Pinpoint Answer Today handles the limited personal data used to operate this LinkedIn Pinpoint companion site.",
    path: "/privacy",
  });
}

export default function PrivacyPage() {
  const lastUpdated = formatStaticRouteLastUpdated("/privacy");

  return (
    <main className="container" style={{ padding: "32px 0 56px" }}>
      <div className="stack">
        <section className="surface" style={{ padding: 32 }}>
          <p className="eyebrow">Legal &amp; Privacy</p>
          <h1 className="section-title">Privacy Notice</h1>
          <p className="copy" style={{ marginTop: 4 }}>Last updated: {lastUpdated}</p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Overview</p>
          <p className="copy" style={{ marginTop: 12 }}>
            Pinpoint Answer Today helps players keep pace with the LinkedIn Pinpoint puzzle by
            providing daily solutions, strategy notes, and archive navigation. This Privacy
            Notice explains the limited personal information we collect when you visit our
            website and how we protect it. We only process data that is necessary to operate the
            site, respond to inquiries, and improve the experience.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Information We Collect</p>
          <p className="copy" style={{ marginTop: 12 }}>We collect minimal information and only in the following situations:</p>
          <ul className="copy" style={{ marginTop: 12, paddingLeft: 20, lineHeight: 2 }}>
            <li><strong>Contact details:</strong> If you email us for support or feedback, we receive the email address and any content you provide in the message.</li>
            <li><strong>Usage analytics:</strong> We may collect aggregated metrics such as page views, referral source, and device type to understand how the site is used. These insights are anonymized and do not contain identifiable information.</li>
            <li><strong>Puzzle interactions:</strong> When you browse puzzle archives or use filters, the selections can be stored locally in your browser to remember preferences.</li>
          </ul>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">How We Use Information</p>
          <ul className="copy" style={{ marginTop: 12, paddingLeft: 20, lineHeight: 2 }}>
            <li>Respond to your inquiries and support requests.</li>
            <li>Monitor site performance and fix technical issues.</li>
            <li>Improve the accuracy of puzzle archives and strategy content.</li>
            <li>Deliver trusted daily puzzle solutions and educational resources.</li>
          </ul>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Data Sharing</p>
          <p className="copy" style={{ marginTop: 12 }}>
            We do not sell or share personal information with third parties, except when required
            by law or to respond to lawful requests by public authorities. Third-party services
            like hosting, analytics, or CDN providers are used strictly to maintain the site.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Data Retention</p>
          <p className="copy" style={{ marginTop: 12 }}>
            Contact information shared with us is deleted once the conversation is resolved unless
            you explicitly request ongoing updates. Aggregated analytics data is periodically
            purged to maintain only trend-level insights.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Your Rights</p>
          <p className="copy" style={{ marginTop: 12 }}>
            You may contact us anytime to request deletion of conversations, receive a copy of
            information we have processed, or ask questions about this notice.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Contact</p>
          <p className="copy" style={{ marginTop: 12 }}>
            Reach us at{" "}
            <a href={supportMailto}>{supportEmail}</a>{" "}
            for questions about privacy or any other topic related to Pinpoint Answer Today.
          </p>
        </section>
      </div>
    </main>
  );
}
