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

function buildExamplePhrase(clue: string, answer: string, category: string): string {
  const answerLower = answer.toLowerCase();
  const categoryLower = category.toLowerCase();
  const clueLower = clue.toLowerCase();

  if (answerLower.startsWith("words that follow ")) {
    const prefix = answerLower.replace("words that follow ", "").trim();
    return `${prefix} ${clueLower}`;
  }

  if (answerLower.startsWith("words after ")) {
    const prefix = answerLower.replace("words after ", "").trim();
    return `${prefix} ${clueLower}`;
  }

  if (categoryLower.startsWith("shades of ")) {
    const suffix = categoryLower.replace("shades of ", "").trim();
    return `${clueLower} ${suffix}`;
  }

  return clue;
}

export function PuzzleFullAnalysis({
  puzzle,
  recentPuzzles,
  nextPreview,
}: {
  puzzle: PuzzleDetailRecord;
  recentPuzzles: ArchiveEntry[];
  nextPreview: NextPreview | null;
}) {
  const overviewParagraphs = puzzle.fullAnalysis.length > 0 ? puzzle.fullAnalysis : [puzzle.shortSummary];
  const firstLesson = puzzle.lessons[0];
  const strategyText = firstLesson
    ? (() => { const p = parseLesson(firstLesson); return p.body; })()
    : "Start with two clues, test one connector, then verify every clue against it.";
  const previousPuzzle = recentPuzzles[0] ?? null;

  return (
    <>
      <div className="legacy-analysis-flow">
        <section className="legacy-analysis-shell" id="analysis">
          <header className="legacy-analysis-header">
            <div className="legacy-analysis-header-inner">
              <Star className="legacy-section-icon" aria-hidden />
              <h2 className="legacy-analysis-title">{`Pinpoint #${puzzle.number} Walkthrough & Analysis`}</h2>
            </div>
          </header>

          <section className="legacy-analysis-section">
            <div className="legacy-section-title-row">
              <Lightbulb className="legacy-section-icon" aria-hidden />
              <h2 className="legacy-section-title">Puzzle Overview</h2>
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
              <h2 className="legacy-section-title">Skim this in 30 seconds</h2>
            </div>
            <ul className="legacy-bullet-list legacy-bullet-list-compact">
              <li>
                <strong>Connector:</strong> {puzzle.answer}
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

          <section className="legacy-analysis-section">
            <div className="legacy-clue-table-shell">
              <div className="legacy-table-kicker-row">
                <Table className="legacy-section-icon" aria-hidden />
                <span className="legacy-table-kicker">{`How Each Clue Connects to "${puzzle.category}"`}</span>
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
                  {puzzle.clues.map((clue) => (
                    <tr key={clue}>
                      <th scope="row">{clue}</th>
                      <td>{`"${buildExamplePhrase(clue, puzzle.answer, puzzle.category)}"`}</td>
                      <td>
                        {puzzle.wordHints[clue] ?? `${clue} fits the same shared rule that leads to ${puzzle.answer}.`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="legacy-analysis-section">
            <div className="legacy-section-title-row">
              <Lightbulb className="legacy-section-icon" aria-hidden />
              <h2 className="legacy-section-title">{`Lessons Learned from Pinpoint #${puzzle.number}`}</h2>
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
              <h2 className="legacy-section-title">FAQ</h2>
            </div>
            <div className="legacy-faq-stack">
              {puzzle.faqs.map((faq) => (
                <article className="legacy-faq-card" key={faq.question}>
                  <h4>{faq.question}</h4>
                  <p className="copy">{faq.answer}</p>
                </article>
              ))}
            </div>
          </section>
        </section>

        <aside className="legacy-next-shell">
          <h3 className="legacy-next-title">Recent Pinpoint answers</h3>
          {nextPreview ? (
            <Link className="legacy-next-link" href={routes.preview}>
              {`Preview Puzzle #${nextPreview.number} - expected ${nextPreview.expectedDate}`}
            </Link>
          ) : null}
          <ul className="legacy-next-list">
            {recentPuzzles.map((entry) => (
              <li key={entry.slug}>
                <Link className="legacy-next-link" href={routes.detail(entry.slug)}>
                  {`LinkedIn Pinpoint #${entry.number} answer - clues: ${entry.clues.join(", ")}`}
                </Link>
              </li>
            ))}
          </ul>
          <div className="legacy-next-actions">
            <Link className="button-secondary" href={routes.archive}>
              View all Pinpoint answers &amp; solutions
            </Link>
          </div>
        </aside>
      </div>

      {previousPuzzle ? (
        <nav className="legacy-puzzle-nav" aria-label="Puzzle navigation">
          <Link className="legacy-puzzle-nav-link" href={routes.detail(previousPuzzle.slug)}>
            {`← Previous (#${previousPuzzle.number})`}
          </Link>
          <span className="legacy-puzzle-nav-spacer" />
        </nav>
      ) : null}
    </>
  );
}
