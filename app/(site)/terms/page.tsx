import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { formatStaticRouteLastUpdated } from "@/lib/site/static-page-metadata";
import { supportEmail, supportMailto } from "@/lib/site/config";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: "Terms of Use | Pinpoint Answer Today",
    description:
      "Review the Terms of Use governing Pinpoint Answer Today, including acceptable conduct, intellectual property, and liability limits.",
    path: "/terms",
    noIndex: true,
  });
}

export default function TermsPage() {
  const lastUpdated = formatStaticRouteLastUpdated("/terms");

  return (
    <main className="container" style={{ padding: "32px 0 56px" }}>
      <div className="stack">
        <section className="surface" style={{ padding: 32 }}>
          <p className="eyebrow">Legal &amp; Privacy</p>
          <h1 className="section-title">Terms of Use</h1>
          <p className="copy" style={{ marginTop: 4 }}>Last updated: {lastUpdated}</p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Acceptance of Terms</p>
          <p className="copy" style={{ marginTop: 12 }}>
            By accessing or using Pinpoint Answer Today, you agree to these Terms of Use and any
            referenced policies such as our Privacy Notice. If you do not agree, please discontinue
            using the site. We may update these terms from time to time; continued use constitutes
            acceptance of the revised version.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Service Description</p>
          <p className="copy" style={{ marginTop: 12 }}>
            Pinpoint Answer Today provides daily solutions and strategy notes for the LinkedIn
            Pinpoint puzzle, along with archives and educational content. The service is offered
            &quot;as is&quot; and may evolve over time as we improve the site, puzzle archive, and content.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Acceptable Use</p>
          <p className="copy" style={{ marginTop: 12 }}>Please do not:</p>
          <ul className="copy" style={{ marginTop: 8, paddingLeft: 20, lineHeight: 2 }}>
            <li>Use the site in a way that violates applicable laws or regulations.</li>
            <li>Attempt to disrupt or compromise the security or availability of the service.</li>
            <li>Harvest puzzle content using automated scripts without permission.</li>
            <li>Misrepresent Pinpoint Answer Today as an official LinkedIn service.</li>
          </ul>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Intellectual Property</p>
          <p className="copy" style={{ marginTop: 12 }}>
            All site content—including puzzle summaries, strategies, and educational materials—is
            provided for personal, non-commercial use. LinkedIn and LinkedIn Pinpoint are
            trademarks of LinkedIn Corporation; Pinpoint Answer Today is an independent companion
            created by fans.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Disclaimers</p>
          <p className="copy" style={{ marginTop: 12 }}>
            We strive to provide accurate puzzle information but cannot guarantee completeness or
            correctness. The site is provided &quot;as is&quot; without warranties of any kind. Pinpoint
            Answer Today is not affiliated with LinkedIn and does not claim any rights to LinkedIn
            content beyond fair use.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Limitation of Liability</p>
          <p className="copy" style={{ marginTop: 12 }}>
            To the fullest extent permitted by law, we are not liable for any damages arising from
            your use of the site. By using Pinpoint Answer Today, you agree to hold us harmless
            from claims arising from your reliance on puzzle answers or strategy notes.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Contact</p>
          <p className="copy" style={{ marginTop: 12 }}>
            Reach us at{" "}
            <a href={supportMailto}>{supportEmail}</a>{" "}
            if you have questions about these terms or the service.
          </p>
        </section>
      </div>
    </main>
  );
}
