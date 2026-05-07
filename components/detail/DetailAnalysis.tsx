import type { PuzzleDetail } from "@/lib/puzzles/data";
import { SectionHeading } from "@/components/shared/SectionHeading";

export function DetailAnalysis({ puzzle }: { puzzle: PuzzleDetail }) {
  const overview = puzzle.articleBlocks[0];
  const journey = puzzle.articleBlocks.slice(1);

  return (
    <section className="surface" style={{ padding: 32 }} id="analysis">
      <SectionHeading
        eyebrow="Walkthrough"
        title="Full Walkthrough"
        description="Start with the short version, then read the longer explanation if you want the full solving path."
      />
      <div className="grid" style={{ marginTop: 24 }}>
        <div className="card detail-overview-card">
          <p className="detail-overview-kicker">Overview</p>
          <p className="copy" style={{ marginTop: 0, marginBottom: 0 }}>
            Puzzle {puzzle.number} resolves to {puzzle.answer}. The shared connection is{" "}
            {puzzle.category}, and the clue set works because every word points back to that same
            family.
          </p>
        </div>
        {overview ? (
          <div className="card">
            <p className="detail-overview-kicker">First read</p>
            <p className="copy" style={{ margin: 0 }}>
              {overview}
            </p>
          </div>
        ) : null}
      </div>

      {journey.length ? (
        <div className="detail-journey-list" style={{ marginTop: 24 }}>
          {journey.map((paragraph, index) => (
            <div className="detail-journey-step" key={`${puzzle.slug}-analysis-${index}`}>
              <span className="detail-journey-index">{index + 1}</span>
              <div className="card" style={{ margin: 0 }}>
                <p className="copy" style={{ margin: 0 }}>
                  {paragraph}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
