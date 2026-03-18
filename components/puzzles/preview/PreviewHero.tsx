import Link from "next/link";
import type { ArchiveEntry, NextPreview } from "@/lib/puzzles/data";
import { routes } from "@/lib/site/routes";

type Props = {
  preview: NextPreview | null;
  latestEntry: ArchiveEntry | null;
};

export function PreviewHero({ preview, latestEntry }: Props) {
  const hasLatest = latestEntry !== null;

  return (
    <section className="surface" style={{ padding: 32, textAlign: "center" }}>
      <p className="eyebrow">Next Pinpoint Preview</p>

      {hasLatest && latestEntry ? (
        <Link
          href={routes.detail(latestEntry.slug)}
          className="chip"
          style={{ display: "inline-flex", marginBottom: 12, background: "#dcfce7", color: "#166534" }}
        >
          Today&rsquo;s Pinpoint {latestEntry.number} answer is here! →
        </Link>
      ) : null}

      <h1 className="section-title">
        {preview
          ? `Are you ready for LinkedIn Pinpoint #${preview.number}?`
          : "Next Pinpoint Preview"}
      </h1>

      <p className="copy" style={{ marginTop: 8, maxWidth: 560, margin: "8px auto 0" }}>
        {hasLatest && latestEntry && preview
          ? `LinkedIn Pinpoint #${latestEntry.number} is now live. Meanwhile, get ready for #${preview.number} with our spoiler-safe solving tips and Common Answer Patterns below.`
          : preview
            ? preview.shortSummary
            : "Use this page to track the next unlock, review spoiler-safe solving tips, and jump back to the latest verified answer while you wait."}
      </p>

      <div className="chip-row" style={{ marginTop: 16, justifyContent: "center" }}>
        <span className="chip">
          {preview ? `Expected around ${preview.expectedDate}` : "Next board date coming soon"}
        </span>
        <span className="chip">Spoiler-safe</span>
        <span className="chip">Training page</span>
        {preview ? <span className="chip">{`Puzzle #${preview.number}`}</span> : null}
        {preview?.clues.map((clue) => (
          <span className="chip" key={clue}>
            {clue}
          </span>
        ))}
      </div>
    </section>
  );
}
