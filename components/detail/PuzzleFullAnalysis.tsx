import Link from "next/link";
import { Star, Lightbulb, Table } from "lucide-react";
import type { ArchiveEntry, NextPreview, PuzzleDetail as PuzzleDetailRecord } from "@/lib/puzzles/data";
import type { LessonItem } from "@/lib/puzzles/schema";
import { routes } from "@/lib/paths/routes";

function parseLesson(lesson: LessonItem): { title: string | null; body: string } {
  if (typeof lesson === "object") {
    return { title: lesson.title, body: lesson.body };
  }
  const dotIdx = lesson.indexOf(". ");
  if (dotIdx > 0 && dotIdx <= 55) {
    return { title: lesson.slice(0, dotIdx), body: lesson.slice(dotIdx + 2) };
  }
  return { title: null, body: lesson };
}

function buildRecentLinkTitle(entry: ArchiveEntry) {
  return `LinkedIn Pinpoint ${entry.number}: ${entry.clues.join(", ")}`;
}
export function PuzzleFullAnalysis({
  puzzle,
  recentPuzzles,
  nextPreview,
  adjacentPrev,
  adjacentNext,
}: {
  puzzle: PuzzleDetailRecord;
  recentPuzzles: ArchiveEntry[];
  nextPreview: NextPreview | null;
  adjacentPrev: ArchiveEntry | null;
  adjacentNext: ArchiveEntry | null;
}) {
  const overviewParagraphs = puzzle.fullAnalysis.length > 0 ? puzzle.fullAnalysis : [puzzle.shortSummary];
  const strategyText = puzzle.display.fastStrategy;

  return (
    <>
      <div className="legacy-analysis-flow">
        <section className="legacy-analysis-shell" id="analysis">
          <header className="legacy-analysis-header">
            <div className="legacy-analysis-header-inner">
              <Star className="legacy-section-icon" aria-hidden />
              <h2 className="legacy-analysis-title">{`Pinpoint Answer Walkthrough & Analysis for #${puzzle.number}`}</h2>
            </div>
          </header>

          <section className="legacy-analysis-section">
            <div className="legacy-section-title-row">
              <Lightbulb className="legacy-section-icon" aria-hidden />
              <h3 className="legacy-section-title">Puzzle Overview</h3>
            </div>
            <ul className="legacy-bullet-list">
              {overviewParagraphs.map((paragraph, index) => (
                <li key={`${puzzle.slug}-overview-${index}`}>{paragraph}</li>
              ))}
            </ul>
          </section>

          <section className="legacy-analysis-section">
            <div className="legacy-section-title-row">
              <Lightbulb className="legacy-section-icon" aria-hidden />
              <h3 className="legacy-section-title">Skim this in 30 seconds</h3>
            </div>
            <ul className="legacy-bullet-list legacy-bullet-list-compact">
              <li>
                <strong>Connector:</strong> {puzzle.display.connectorSummary}
              </li>
              <li>
                <strong>Clues:</strong> {puzzle.clues.join(" · ")}
              </li>
              <li>
                <strong>Difficulty:</strong> {puzzle.difficulty}
              </li>
              <li>
                <strong>Fast strategy:</strong> {strategyText}
              </li>
            </ul>
          </section>

          {puzzle.solutionNarrative.length > 0 && (
            <section className="legacy-analysis-section">
              <div className="legacy-section-title-row">
                <Lightbulb className="legacy-section-icon" aria-hidden />
                <h3 className="legacy-section-title">How I solved it</h3>
              </div>
              <div className="legacy-prose-stack">
                {puzzle.solutionNarrative.map((paragraph, index) => (
                  <p key={`${puzzle.slug}-narrative-${index}`}>{paragraph}</p>
                ))}
              </div>
            </section>
          )}

          <section className="legacy-analysis-section">
            <div className="legacy-clue-table-shell">
              <div className="legacy-table-kicker-row">
                <Table className="legacy-section-icon" aria-hidden />
                <h3 className="legacy-table-kicker">How Each Clue Resolves</h3>
              </div>
              <table
                className="legacy-clue-table"
                aria-label={`Detailed breakdown of each clue word, example phrase, and explanation`}
              >
                <caption className="sr-only">
                  Detailed breakdown of each clue word, example phrase, and explanation
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Clue Word</th>
                    <th scope="col">Example Phrase</th>
                    <th scope="col">Connection Explained</th>
                  </tr>
                </thead>
                <tbody>
                  {puzzle.display.clueTableRows.map((row) => (
                    <tr key={row.clue}>
                      <th scope="row">{row.clue}</th>
                      <td>{`"${row.examplePhrase}"`}</td>
                      <td>{row.connectionExplained}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="legacy-analysis-section">
            <div className="legacy-section-title-row">
              <Lightbulb className="legacy-section-icon" aria-hidden />
              <h3 className="legacy-section-title">{`Lessons Learned from Pinpoint #${puzzle.number}`}</h3>
            </div>
            <ol className="legacy-numbered-list">
              {puzzle.lessons.map((lesson, index) => {
                const { title, body } = parseLesson(lesson);
                return (
                  <li key={`${puzzle.slug}-lesson-${index}`}>
                    <span className="legacy-lesson-number">{index + 1}</span>
                    <div className="legacy-lesson-body">
                      {title ? <p className="legacy-lesson-title">{title}</p> : null}
                      <p>{body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="legacy-analysis-section">
            <div className="legacy-section-title-row">
              <Lightbulb className="legacy-section-icon" aria-hidden />
              <h3 className="legacy-section-title">FAQ</h3>
            </div>
            <div className="legacy-faq-stack">
              {puzzle.faqs.map((faq) => (
                <article className="legacy-faq-card" key={faq.question}>
                  <h4 className="legacy-faq-question">{faq.question}</h4>
                  <p className="copy">{faq.answer}</p>
                </article>
              ))}
            </div>
          </section>
        </section>

        <aside className="legacy-next-shell" aria-label="Recent Pinpoint answer pages">
          <h2 className="legacy-next-title">Recent Pinpoint answer pages</h2>
          {nextPreview ? (
            <Link className="legacy-next-link" href={routes.preview}>
              {`Preview Puzzle #${nextPreview.number} - expected ${nextPreview.expectedDate}`}
            </Link>
          ) : null}
          <ul className="legacy-next-list">
            {recentPuzzles.map((entry) => (
              <li key={entry.slug}>
                <Link
                  className="legacy-next-link"
                  href={routes.detail(entry.slug)}
                  aria-label={`Open ${buildRecentLinkTitle(entry)}`}
                >
                  <h3 className="legacy-next-link-title">{buildRecentLinkTitle(entry)}</h3>
                </Link>
              </li>
            ))}
          </ul>
          <div className="legacy-next-actions">
            <Link className="button-secondary" href={routes.archive}>
              View all Pinpoint answer pages
            </Link>
          </div>
        </aside>
      </div>

      {(adjacentPrev || adjacentNext) && (
        <nav className="legacy-puzzle-nav" aria-label="Puzzle navigation">
          {adjacentPrev ? (
            <Link className="legacy-puzzle-nav-link" href={routes.detail(adjacentPrev.slug)}>
              {`← Pinpoint #${adjacentPrev.number}`}
            </Link>
          ) : (
            <span />
          )}
          {adjacentNext ? (
            <Link className="legacy-puzzle-nav-link" href={routes.detail(adjacentNext.slug)}>
              {`Pinpoint #${adjacentNext.number} →`}
            </Link>
          ) : null}
        </nav>
      )}
    </>
  );
}
