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

function getFallbackTeachingTitle(body: string, index: number): string {
  const firstSentence = cleanReasoningText(body).split(/[.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 82) {
    return firstSentence;
  }

  return `Solving takeaway ${index + 1}`;
}

function getTeachingLessonTitle(lesson: PuzzleDetailRecord["lessons"][number], index: number): string {
  return typeof lesson === "string" ? getFallbackTeachingTitle(lesson, index) : lesson.title;
}

function replaceQuotedCluePairs(value: string): string {
  return value
    .replace(/"([^"]+)"\s+and\s+"([^"]+)"/g, "Both clues")
    .replace(/“([^”]+)”\s+and\s+“([^”]+)”/g, "Both clues");
}

function cleanTeachingBody(body: string, puzzle: PuzzleDetailRecord): string {
  let cleaned = replaceQuotedCluePairs(cleanReasoningText(body));

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
  const visibleFaqEntries = getVisibleDetailFaqEntries(puzzle.faqItems, puzzle.faqs, puzzle.detailMode);
  const recentLinks = recentPuzzles.filter((entry) => entry.slug !== puzzle.slug).slice(0, 10);

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
            <div className="legacy-reasoning-story">
              {reasoningStory.map((block) => (
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
              ))}
            </div>
          </section>

          {renderWhatThisPinpointTeaches(puzzle, visibleFaqEntries)}
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
