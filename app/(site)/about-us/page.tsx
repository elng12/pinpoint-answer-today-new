import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { routes } from "@/lib/paths/routes";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: "About Us | Pinpoint Answer Today",
    description:
      "Learn how Pinpoint Answer Today publishes daily LinkedIn Pinpoint answers, spoiler-safe hints, and archive recaps.",
    path: "/about-us",
  });
}

export default function AboutPage() {
  return (
    <main className="container" style={{ padding: "32px 0 56px" }}>
      <div className="stack">
        <section className="surface" style={{ padding: 32 }}>
          <p className="eyebrow">About</p>
          <h1 className="section-title">About Pinpoint Answer Today</h1>
          <p className="copy" style={{ marginTop: 12 }}>
            Pinpoint Answer Today is a fan-built companion for the daily LinkedIn puzzle. We
            publish machine-checked answers, spoiler-safe hints, and archive recaps.
          </p>
        </section>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <section className="surface" style={{ padding: 28 }}>
            <p className="eyebrow">Editorial Policy</p>
            <ul className="copy" style={{ marginTop: 12, paddingLeft: 20, lineHeight: 2 }}>
              <li>We publish after the puzzle unlocks and the solve is verified.</li>
              <li>Hints are designed to be spoiler-safe; full reveals are opt-in.</li>
              <li>Archive pages are updated when better explanations become available.</li>
            </ul>
          </section>

          <section className="surface" style={{ padding: 28 }}>
            <p className="eyebrow">Corrections</p>
            <p className="copy" style={{ marginTop: 12 }}>
              If you spot an error, please reach out. We correct mistakes promptly and aim to
              keep the archive accurate over time.
            </p>
            <div style={{ marginTop: 20 }}>
              <Link href={routes.contact} className="button-secondary">
                Contact us
              </Link>
            </div>
          </section>
        </div>

        <section id="editorial-process" className="surface" style={{ padding: 28, scrollMarginTop: 100 }}>
          <p className="eyebrow">Editorial Process</p>
          <h2 className="section-title" style={{ marginTop: 8 }}>How we verify each Pinpoint page</h2>
          <p className="copy" style={{ marginTop: 12 }}>
            Each Pinpoint answer page combines live puzzle data, AI review, and automated checks so the
            public page is useful, consistent, and traceable over time.
          </p>
          <ol className="copy" style={{ marginTop: 16, paddingLeft: 20, lineHeight: 2 }}>
            <li>Live puzzle data gives us the clue set, answer, and publish timing for the day.</li>
            <li>AI review checks the explanation, turning point, and clue-by-clue fit.</li>
            <li>Automated quality checks validate data integrity and catch thin or malformed copy before release.</li>
          </ol>
          <p className="copy" style={{ marginTop: 12 }}>
            Pages marked <strong>Machine-checked and AI-reviewed</strong> passed the automated review workflow.
            Pages marked <strong>Auto-generated quick guide</strong> are based on live puzzle data and may offer a
            lighter explanation layer until a fuller walkthrough is available.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Corrections Policy</p>
          <p className="copy" style={{ marginTop: 12 }}>
            If you spot an error, use the contact page and include the puzzle number plus any context
            that would help us reproduce the issue. We aim to review corrections within 24 hours, and
            when a page is updated the visible &quot;Updated on&quot; date is refreshed.
          </p>
        </section>

        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">Independence</p>
          <p className="copy" style={{ marginTop: 12 }}>
            Pinpoint Answer Today is not affiliated with LinkedIn. All trademarks and puzzle
            content belong to their respective owners.
          </p>
        </section>
      </div>
    </main>
  );
}
