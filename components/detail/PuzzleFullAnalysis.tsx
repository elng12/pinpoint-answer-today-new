import Link from "next/link";
import type { ArchiveEntry, PuzzleDetail as PuzzleDetailRecord } from "@/lib/puzzles/data";
import {
  getVisibleDetailFaqEntries,
  type VisibleDetailFaqEntry,
} from "@/lib/puzzles/detail-view";
import { routes } from "@/lib/paths/routes";

function buildRecentLinkTitle(entry: ArchiveEntry) {
  return `LinkedIn Pinpoint ${entry.number}: ${entry.clues.join(", ")}`;
}

function normalizeParagraphKey(paragraph: string): string {
  return paragraph.toLowerCase().replace(/\s+/g, " ").trim();
}

function formatCluePath(clues: string[]): string {
  return clues.join(", ");
}

function normalizePhraseTokens(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u2032'"]/g, "")
    .replace(/[‐‑‒–—-]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTemplateLeftovers(paragraph: string): string {
  return paragraph
    .replace(/\s*Use the clue table[^.]*\./gi, "")
    .replace(/\s*Use the table below[^.]*\./gi, "")
    .replace(/\s*then skim the compact FAQ[^.]*\./gi, "")
    .replace(/\s*and the compact FAQ below[^.]*\./gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const paragraph of paragraphs.map(cleanTemplateLeftovers).filter(Boolean)) {
    const key = normalizeParagraphKey(paragraph);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(paragraph);
  }

  return unique;
}

function paragraphMentionsAnswer(paragraph: string, answer: string): boolean {
  const normalizedParagraph = normalizeParagraphKey(paragraph);
  const normalizedAnswer = normalizeParagraphKey(answer);
  return (
    (normalizedAnswer.length > 0 && normalizedParagraph.includes(normalizedAnswer)) ||
    /\bthe answer (?:is|was)\b/i.test(paragraph)
  );
}

function keepAnswerNearEnd(paragraphs: string[], answer: string): string[] {
  if (paragraphs.length <= 1) {
    return paragraphs;
  }

  const answerParagraphs = paragraphs.filter((paragraph) => paragraphMentionsAnswer(paragraph, answer));
  const setupParagraphs = paragraphs.filter((paragraph) => !paragraphMentionsAnswer(paragraph, answer));

  if (setupParagraphs.length === 0 || answerParagraphs.length === 0) {
    return paragraphs;
  }

  return [...setupParagraphs, ...answerParagraphs];
}

function buildCluePathLead(puzzle: PuzzleDetailRecord): string {
  return `${formatCluePath(puzzle.clues)} point to one shared pattern; the notes below follow the clue order before explaining why the final connection holds.`;
}

function shouldPrependCluePath(paragraphs: string[], clues: string[]): boolean {
  if (clues.length < 3) {
    return false;
  }

  const cluePath = normalizePhraseTokens(formatCluePath(clues));
  return !paragraphs.some((paragraph) => normalizePhraseTokens(paragraph).includes(cluePath));
}

function buildSolvePathParagraphs(puzzle: PuzzleDetailRecord): string[] {
  const paragraphs: string[] = [];

  if (puzzle.solvePath?.firstRead) {
    paragraphs.push(puzzle.solvePath.firstRead);
  }

  puzzle.solvePath?.falseStarts.forEach((guess, index) => {
    const why = puzzle.solvePath?.whyFalseStartPlausible[index];
    paragraphs.push(why ? `A first guess was "${guess}". ${why}` : `A first guess was "${guess}".`);
  });

  if (puzzle.turningPoint?.clue) {
    paragraphs.push(`${puzzle.turningPoint.clue} was the turning clue. ${puzzle.turningPoint.whyDecisive}`);
  } else if (puzzle.solvePath?.breakingClue) {
    paragraphs.push(`${puzzle.solvePath.breakingClue} was the clue that narrowed the board.`);
  }

  if (puzzle.turningPoint?.whatChangedAfterIt) {
    paragraphs.push(puzzle.turningPoint.whatChangedAfterIt);
  }

  if (puzzle.solvePath?.fullBoardConfirmation) {
    paragraphs.push(puzzle.solvePath.fullBoardConfirmation);
  }

  return paragraphs;
}

function buildReasoningParagraphs(puzzle: PuzzleDetailRecord): string[] {
  const sourceParagraphs =
    puzzle.solutionNarrative.length > 0
      ? puzzle.solutionNarrative
      : buildSolvePathParagraphs(puzzle).length > 0
        ? buildSolvePathParagraphs(puzzle)
        : puzzle.articleBlocks.length > 0
          ? puzzle.articleBlocks
          : [puzzle.shortSummary];

  const orderedParagraphs = keepAnswerNearEnd(dedupeParagraphs(sourceParagraphs), puzzle.answer);
  const paragraphs = shouldPrependCluePath(orderedParagraphs, puzzle.clues)
    ? [buildCluePathLead(puzzle), ...orderedParagraphs]
    : orderedParagraphs;
  const hasAnswer = paragraphs.some((paragraph) => paragraphMentionsAnswer(paragraph, puzzle.answer));
  return hasAnswer ? paragraphs : [...paragraphs, `The answer was ${puzzle.answer}.`];
}

function renderFaqCards(faqEntries: VisibleDetailFaqEntry[]) {
  return faqEntries.map((faq) => (
    <article className="legacy-faq-card" key={faq.question}>
      <h4 className="legacy-faq-question">{faq.question}</h4>
      {faq.intentType === "clue_background" && faq.tiedClue ? (
        <p className="legacy-faq-meta">{`Tied clue: ${faq.tiedClue}`}</p>
      ) : null}
      <p className="copy">{faq.answer}</p>
    </article>
  ));
}

export function PuzzleFullAnalysis({
  puzzle,
  recentPuzzles,
  adjacentPrev,
  adjacentNext,
}: {
  puzzle: PuzzleDetailRecord;
  recentPuzzles: ArchiveEntry[];
  adjacentPrev: ArchiveEntry | null;
  adjacentNext: ArchiveEntry | null;
}) {
  const reasoningParagraphs = buildReasoningParagraphs(puzzle);
  const visibleFaqEntries = getVisibleDetailFaqEntries(puzzle.faqItems, puzzle.faqs, puzzle.detailMode);
  const recentLinks = recentPuzzles.filter((entry) => entry.slug !== puzzle.slug).slice(0, 3);

  return (
    <>
      <div className="legacy-analysis-flow">
        <section className="legacy-analysis-shell" id="analysis" aria-labelledby="answer-reasoning-title">
          <header className="legacy-analysis-header">
            <h2 className="legacy-analysis-title" id="answer-reasoning-title">
              Answer Reasoning
            </h2>
          </header>

          <section className="legacy-analysis-section legacy-analysis-section-first">
            <div className="legacy-prose-stack">
              {reasoningParagraphs.map((paragraph, index) => (
                <p key={`${puzzle.slug}-reasoning-${index}`}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="legacy-analysis-section" id="faq" aria-labelledby="pinpoint-faq-title">
            <h3 className="legacy-section-title" id="pinpoint-faq-title">
              FAQ
            </h3>
            <div className="legacy-faq-stack">{renderFaqCards(visibleFaqEntries)}</div>
          </section>
        </section>

        <aside className="legacy-next-shell" aria-label="Recent Pinpoint answer pages">
          <h2 className="legacy-next-title">Recent Pinpoint answer pages</h2>
          <ul className="legacy-next-list">
            {recentLinks.map((entry) => (
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
              {`Previous: Pinpoint #${adjacentPrev.number}`}
            </Link>
          ) : (
            <span />
          )}
          {adjacentNext ? (
            <Link className="legacy-puzzle-nav-link" href={routes.detail(adjacentNext.slug)}>
              {`Next: Pinpoint #${adjacentNext.number}`}
            </Link>
          ) : null}
        </nav>
      )}
    </>
  );
}
