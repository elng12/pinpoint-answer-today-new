import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { formatStaticRouteLastUpdated } from "@/lib/site/static-page-metadata";
import { supportEmail, supportMailto } from "@/lib/site/config";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: "Disclaimer | Pinpoint Answer Today",
    description:
      "Read how Pinpoint Answer Today operates as an independent LinkedIn Pinpoint companion and what limitations apply.",
    path: "/disclaimer",
    noIndex: true,
  });
}

export default function DisclaimerPage() {
  const lastUpdated = formatStaticRouteLastUpdated("/disclaimer");

  return (
    <main className="container" style={{ padding: "32px 0 56px" }}>
      <div className="stack">
        <section className="surface" style={{ padding: 32 }}>
          <p className="eyebrow">Legal &amp; Privacy</p>
          <h1 className="section-title">Disclaimer</h1>
          <p className="copy" style={{ marginTop: 4 }}>Last updated: {lastUpdated}</p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Independent Companion Site</p>
          <p className="copy" style={{ marginTop: 12 }}>
            Pinpoint Answer Today is a fan-made companion resource designed to help players follow
            the LinkedIn Pinpoint puzzle. We are not affiliated with LinkedIn, Microsoft, or any
            official Pinpoint team. LinkedIn Pinpoint is a trademark of LinkedIn Corporation and is
            referenced here for descriptive purposes only.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">No Official Endorsement</p>
          <p className="copy" style={{ marginTop: 12 }}>
            All walkthroughs, strategy notes, and archives are compiled independently. LinkedIn has
            not reviewed or approved this content. If you are looking for official puzzle rules,
            scores, or account information, please visit LinkedIn directly.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Accuracy of Information</p>
          <p className="copy" style={{ marginTop: 12 }}>
            We strive to ensure puzzle answers, archived solutions, and hints are accurate.
            However, errors may occur or puzzles may change after publication. Use our summaries at
            your own discretion and verify information when necessary.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Educational Purpose</p>
          <p className="copy" style={{ marginTop: 12 }}>
            Content on this site is provided for educational and entertainment purposes to help the
            Pinpoint player community. It should not be relied on for employment, investment, or
            other critical decisions.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Contact</p>
          <p className="copy" style={{ marginTop: 12 }}>
            If you have questions or would like to report an issue, please contact us at{" "}
            <a href={supportMailto}>{supportEmail}</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
