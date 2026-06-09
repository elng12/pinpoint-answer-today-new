import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ArchiveEntry, PuzzleDetail as PuzzleDetailRecord } from "@/lib/puzzles/data";
import {
  getVisibleDetailFaqEntries,
  type VisibleDetailFaqEntry,
} from "@/lib/puzzles/detail-view";
import { buildReasoningArticleDraft, cleanReasoningText } from "@/lib/puzzles/reasoning-article";
import { routes } from "@/lib/paths/routes";

function buildRecentLinkTitle(entry: ArchiveEntry, includeLinkedIn = false) {
  return `${includeLinkedIn ? "LinkedIn " : ""}Pinpoint ${entry.number}: ${entry.clues.join(", ")}`;
}

function formatAnalysisDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function getLessonKey(lesson: PuzzleDetailRecord["lessons"][number], index: number): string {
  return typeof lesson === "string" ? `lesson-${index}` : lesson.title;
}

function getLessonBody(lesson: PuzzleDetailRecord["lessons"][number]): string {
  return typeof lesson === "string" ? lesson : lesson.body;
}

type TeachingCard = {
  body: string;
  key: string;
  kind: "lesson" | "question";
  title: string;
};

const GENERIC_TEACHING_BODY_PATTERNS = [
  /\bWhen solving puzzles,\s*(?:consider|look for)\b/i,
  /\bcommon thread that (?:connects|ties)\b/i,
  /\bunique aspects of each clue\b/i,
  /\boverall answer\b/i,
  /\bseemingly unrelated clues\b/i,
];

function getFallbackTeachingTitle(body: string, index: number): string {
  const firstSentence = cleanReasoningText(body).split(/[.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 82) {
    return firstSentence;
  }

  return `Solving takeaway ${index + 1}`;
}

function cleanTeachingTitle(title: string): string {
  return cleanReasoningText(title)
    .replace(/\banchors a shared category board with one concrete theme\b/gi, "anchors the answer frame")
    .replace(/\bunder a shared category board with one concrete theme\b/gi, "under the same answer frame")
    .trim();
}

function getTeachingLessonTitle(lesson: PuzzleDetailRecord["lessons"][number], index: number): string {
  const title = typeof lesson === "string" ? getFallbackTeachingTitle(lesson, index) : lesson.title;
  return cleanTeachingTitle(title);
}

function replaceQuotedCluePairs(value: string): string {
  return value
    .replace(/"([^"]+)"\s+and\s+"([^"]+)"/g, "Both clues")
    .replace(/“([^”]+)”\s+and\s+“([^”]+)”/g, "Both clues");
}

function getTeachingAnchorClue(puzzle: PuzzleDetailRecord): string {
  return puzzle.turningPoint?.clue || puzzle.solvePath?.breakingClue || puzzle.clues[puzzle.clues.length - 1] || "the turning clue";
}

function buildSpecificTeachingBody(puzzle: PuzzleDetailRecord): string {
  const anchorClue = getTeachingAnchorClue(puzzle);
  const firstClue = puzzle.clues[0] || "the first clue";
  return `Use ${anchorClue} to re-check ${firstClue}. A strong Pinpoint answer should make the early clues and later clues fit one reading.`;
}

function cleanTeachingBody(body: string, puzzle: PuzzleDetailRecord): string {
  let cleaned = replaceQuotedCluePairs(cleanReasoningText(body));

  if (GENERIC_TEACHING_BODY_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return buildSpecificTeachingBody(puzzle);
  }

  for (const clue of puzzle.clues) {
    if (clue.trim().split(/\s+/).length <= 1) {
      continue;
    }

    const escaped = clue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned
      .replace(new RegExp(`"(${escaped})"`, "gi"), "that clue")
      .replace(new RegExp(`\\b${escaped}\\b`, "gi"), "that clue");
  }

  return cleaned
    .replace(/\bthat clue\s+and\s+that clue\b/gi, "both clues")
    .replace(/\bthat clue clue\b/gi, "that clue")
    .replace(/\bBoth clues both\b/g, "Both clues")
    .replace(/\bboth clues both\b/g, "both clues")
    .replace(/(^|[.!?]\s+)that clue\b/gi, "$1That clue")
    .replace(/(^|[.!?]\s+)both clues\b/gi, "$1Both clues")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTeachingCards(
  puzzle: PuzzleDetailRecord,
  faqEntries: VisibleDetailFaqEntry[],
): TeachingCard[] {
  const lessonCards = puzzle.lessons.map((lesson, index) => ({
    body: cleanTeachingBody(getLessonBody(lesson), puzzle),
    key: `lesson-${index}-${getLessonKey(lesson, index)}`,
    kind: "lesson" as const,
    title: getTeachingLessonTitle(lesson, index),
  }));

  const questionCards = faqEntries.slice(0, 3).map((faq) => ({
    body: faq.answer,
    key: `question-${faq.question}`,
    kind: "question" as const,
    title: faq.question,
  }));

  const cards = lessonCards.length >= 3 ? lessonCards.slice(0, 3) : [...lessonCards, ...questionCards].slice(0, 3);
  return cards.filter((card) => card.title && card.body);
}

function renderWhatThisPinpointTeaches(puzzle: PuzzleDetailRecord, faqEntries: VisibleDetailFaqEntry[]) {
  const teachingCards = buildTeachingCards(puzzle, faqEntries);

  if (teachingCards.length === 0) {
    return null;
  }

  return (
    <section className="legacy-analysis-section" id="faq" aria-labelledby="pinpoint-teaches-title">
      <h3 className="legacy-section-title" id="pinpoint-teaches-title">
        What This Pinpoint Teaches
      </h3>
      <div className="legacy-teaches-list">
        {teachingCards.map((card) => (
          <article
            className="legacy-teaches-item"
            key={card.key}
          >
            <h4 className="legacy-teaches-title">{card.title}</h4>
            <p className="legacy-teaches-copy">{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function renderClueEvidenceTable(puzzle: PuzzleDetailRecord) {
  const rows = puzzle.clueRows.length > 0
    ? puzzle.clueRows.map((row, index) => ({
        clue: row.clue || puzzle.clues[index] || "",
        connection: row.resolvedPhraseOrMember || row.phraseExample || row.searchableContext || "",
        explanation: row.nonObviousWhy || puzzle.wordHints[row.clue] || "",
      }))
    : puzzle.display.clueTableRows.map((row) => ({
        clue: row.clue,
        connection: row.examplePhrase,
        explanation: row.connectionExplained,
      }));

  const usefulRows = rows.filter((row) => row.clue && (row.connection || row.explanation));
  if (usefulRows.length === 0) {
    return null;
  }

  return (
    <section className="legacy-analysis-section legacy-clue-proof-section" aria-labelledby="clue-proof-title">
      <h3 className="legacy-section-title" id="clue-proof-title">
        Clue-by-clue answer check
      </h3>
      <div className="legacy-clue-table-shell">
        <div className="legacy-table-kicker-row">
          <p className="legacy-table-kicker">{`LinkedIn Pinpoint ${puzzle.number} answer proof`}</p>
        </div>
        <div className="legacy-clue-table-scroll">
          <table className="legacy-clue-table legacy-clue-table-evidence">
            <thead>
              <tr>
                <th scope="col">Clue</th>
                <th scope="col">Answer fit</th>
                <th scope="col">Why it works</th>
              </tr>
            </thead>
            <tbody>
              {usefulRows.map((row, index) => (
                <tr key={`${row.clue}-${index}`}>
                  <th scope="row">{row.clue}</th>
                  <td>{row.connection || "Same answer pattern"}</td>
                  <td>{row.explanation || `${row.clue} fits ${puzzle.category}.`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
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
  const reasoningStory = buildReasoningArticleDraft(puzzle).blocks;
  const reasoningPreview = reasoningStory.slice(0, 1);
  const reasoningFullText = reasoningStory.slice(1);
  const visibleFaqEntries = getVisibleDetailFaqEntries(puzzle.faqItems, puzzle.faqs, puzzle.detailMode);
  const teachingSection = renderWhatThisPinpointTeaches(puzzle, visibleFaqEntries);
  const clueEvidenceTable = renderClueEvidenceTable(puzzle);
  const recentLinks = recentPuzzles.filter((entry) => entry.slug !== puzzle.slug).slice(0, 10);
  const renderReasoningBlocks = (blocks: typeof reasoningStory) =>
    blocks.map((block) => (
      <article
        className={`legacy-reasoning-block${
          block.variant === "answer" ? " legacy-reasoning-block-answer" : ""
        }${block.title ? "" : " legacy-reasoning-block-lead"}`}
        key={`${puzzle.slug}-reasoning-${block.key}`}
      >
        {block.title ? <h3 className="legacy-reasoning-title">{block.title}</h3> : null}
        <div className="legacy-reasoning-copy-stack">
          {block.body.map((paragraph, index) => (
            <p className="legacy-reasoning-copy" key={`${block.key}-paragraph-${index}`}>
              {paragraph}
            </p>
          ))}
        </div>
        {block.bullets && block.bullets.length > 0 ? (
          <ul className="legacy-reasoning-list">
            {block.bullets.map((item) => (
              <li key={`${block.key}-bullet-${item}`}>{item}</li>
            ))}
          </ul>
        ) : null}
      </article>
    ));

  return (
    <>
      <div className="legacy-analysis-flow">
        <section className="legacy-analysis-shell" id="analysis" aria-labelledby="answer-reasoning-title">
          <header className="legacy-analysis-header">
            <div className="legacy-analysis-byline" aria-label="Article metadata">
              <p>By Pinpoint Answer</p>
              <p>{`Published on ${formatAnalysisDate(puzzle.isoDate)}`}</p>
            </div>
            <div className="legacy-analysis-title-row">
              <span className="legacy-analysis-title-icon" aria-hidden="true">
                🧩
              </span>
              <h2 className="legacy-analysis-title" id="answer-reasoning-title">
                {`LinkedIn Pinpoint ${puzzle.number} Answer Reasoning`}
              </h2>
            </div>
          </header>

          <section className="legacy-analysis-section legacy-analysis-section-first">
            <div className="legacy-reasoning-story legacy-reasoning-story-preview">
              {renderReasoningBlocks(reasoningPreview)}
            </div>
            {clueEvidenceTable}
            {reasoningFullText.length > 0 ? (
              <details className="legacy-reasoning-details">
                <summary className="legacy-reasoning-read-more">
                  <ChevronRight className="legacy-reasoning-read-more-icon" aria-hidden="true" />
                  <span className="legacy-reasoning-more-text">Read More</span>
                  <span className="legacy-reasoning-less-text">Show Less</span>
                </summary>
                <div className="legacy-reasoning-story legacy-reasoning-story-full">
                  {renderReasoningBlocks(reasoningFullText)}
                </div>
                {teachingSection}
              </details>
            ) : null}
          </section>
        </section>

        <aside className="legacy-next-shell" aria-label="Recent Pinpoint answer pages">
          <h2 className="legacy-next-title">Recent Pinpoint answer pages</h2>
          <ul className="legacy-next-list">
            {recentLinks.map((entry, index) => {
              const linkTitle = buildRecentLinkTitle(entry, index < 4);
              return (
              <li key={entry.slug}>
                <Link
                  className="legacy-next-link"
                  href={routes.detail(entry.slug)}
                  aria-label={`Open ${linkTitle}`}
                >
                  <h3 className="legacy-next-link-title">{linkTitle}</h3>
                </Link>
              </li>
              );
            })}
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
