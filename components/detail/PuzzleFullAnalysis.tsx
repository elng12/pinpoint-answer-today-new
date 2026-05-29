import Link from "next/link";
import { Star, Lightbulb, Table } from "lucide-react";
import type { ArchiveEntry, NextPreview, PuzzleDetail as PuzzleDetailRecord } from "@/lib/puzzles/data";
import { LatestAnswerCta, type LatestAnswerCtaPuzzle } from "@/components/detail/LatestAnswerCta";
import {
  formatPuzzleDifficultyBandLabel,
  formatPuzzleQuestionTypeLabel,
  getVisibleDetailFaqEntries,
  type VisibleDetailFaqEntry,
} from "@/lib/puzzles/detail-view";
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

function splitIntoSentences(paragraph: string): string[] {
  const matches = paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*)?(?=\s+|$)/g);
  return (matches ?? [paragraph]).map((sentence) => sentence.trim()).filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPreviousWord(input: string, matchStart: number): string | null {
  const before = input.slice(0, matchStart);
  const match = before.match(/([A-Za-z]+)[^A-Za-z]*$/);
  return match?.[1] ?? null;
}

function findNextWord(input: string, matchEnd: number): string | null {
  const after = input.slice(matchEnd);
  const match = after.match(/^[^A-Za-z]*([A-Za-z]+)/);
  return match?.[1] ?? null;
}

type SharedPhraseToken = { kind: "before" | "after"; token: string };

function getSharedPhraseToken(answer: string): SharedPhraseToken | null {
  const trimmed = answer.trim();
  const after = trimmed.match(/^Words that come after\s+["“]?(.+?)["”]?$/i);
  if (after?.[1]) return { kind: "after", token: after[1].trim().toLowerCase() };
  const before = trimmed.match(/^Words that come before\s+["“]?(.+?)["”]?$/i);
  if (before?.[1]) return { kind: "before", token: before[1].trim().toLowerCase() };
  return null;
}

function applyClueCasing(paragraph: string, clues: string[], phraseToken: SharedPhraseToken | null): string {
  let out = paragraph;
  const normalizedClues = clues
    .map((clue) => clue.trim())
    .filter(Boolean)
    // Replace multi-word clues first so single-word passes don't disturb them.
    .sort((a, b) => b.length - a.length);

  for (const clue of normalizedClues) {
    // Only apply casing to simple alpha words/phrases; skip emoji/punctuation-heavy clues.
    if (!/^[A-Za-z][A-Za-z'’\-\s]*$/.test(clue)) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(clue)}\\b`, "gi");
    const isSingleWord = !clue.includes(" ");

    out = out.replace(pattern, (match, offset) => {
      if (!isSingleWord) return clue;

      if (phraseToken?.kind === "after") {
        const previousWord = findPreviousWord(out, offset);
        if (previousWord?.toLowerCase() === phraseToken.token) {
          // e.g. keep "paper plane" lowercase in shared-word puzzles.
          return match;
        }
      }

      if (phraseToken?.kind === "before") {
        const nextWord = findNextWord(out, offset + match.length);
        if (nextWord?.toLowerCase() === phraseToken.token) {
          // e.g. keep "traffic light" lowercase in shared-word puzzles.
          return match;
        }
      }

      return clue;
    });
  }

  return out;
}

function buildReadableParagraphs(paragraphs: string[]): string[] {
  const trimmedParagraphs = paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
  if (trimmedParagraphs.length >= 5) {
    return trimmedParagraphs;
  }

  return paragraphs.flatMap((paragraph) => {
    const sentences = splitIntoSentences(paragraph);
    return sentences.length > 0 ? sentences : [paragraph.trim()];
  });
}

function formatPublishedDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function buildWalkthroughParagraphs(puzzle: PuzzleDetailRecord): string[] {
  const sourceParagraphs =
    puzzle.articleBlocks.length > 0
      ? puzzle.articleBlocks
      : puzzle.solutionNarrative.length > 0
        ? puzzle.solutionNarrative
        : [puzzle.shortSummary];

  const readableParagraphs = buildReadableParagraphs(sourceParagraphs);
  const normalizedAnswer = puzzle.answer.trim().toLowerCase();

  if (normalizedAnswer.length === 0) {
    return readableParagraphs;
  }

  const anyParagraphMentionsAnswer = readableParagraphs.some((paragraph) => {
    const normalizedParagraph = paragraph.toLowerCase();
    return (
      normalizedParagraph.includes(normalizedAnswer) ||
      normalizedParagraph.includes("the answer is") ||
      normalizedParagraph.includes("the answer was")
    );
  });

  const paragraphsWithLead = readableParagraphs;

  if (anyParagraphMentionsAnswer) {
    return paragraphsWithLead;
  }

  return [...paragraphsWithLead, `The answer was ${puzzle.answer}.`];
}

function sentenceMentionsAnswer(sentence: string, puzzle: PuzzleDetailRecord): boolean {
  const normalizedSentence = sentence.trim().toLowerCase();
  const normalizedAnswer = puzzle.answer.trim().toLowerCase();

  if (!normalizedSentence) {
    return false;
  }

  return (
    (normalizedAnswer.length > 0 && normalizedSentence.includes(normalizedAnswer)) ||
    normalizedSentence.includes("the answer is") ||
    normalizedSentence.includes("the answer was")
  );
}

function normalizeParagraphKey(paragraph: string): string {
  return paragraph.toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const paragraph of paragraphs.map((item) => item.trim()).filter(Boolean)) {
    const key = normalizeParagraphKey(paragraph);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(paragraph);
  }
  return unique;
}

function mergeOpeningParagraphBlock(paragraphs: string[], puzzle: PuzzleDetailRecord): string[] {
  if (paragraphs.length === 0) {
    return paragraphs;
  }

  const firstParagraphSentenceCount = splitIntoSentences(paragraphs[0]).length;
  if (firstParagraphSentenceCount >= 2 && firstParagraphSentenceCount <= 5) {
    return paragraphs;
  }

  const safeOpeningSentences: string[] = [];
  const paragraphSentences = paragraphs.map((paragraph) => splitIntoSentences(paragraph));

  for (const sentences of paragraphSentences) {
    for (const sentence of sentences) {
      if (sentenceMentionsAnswer(sentence, puzzle)) {
        break;
      }
      safeOpeningSentences.push(sentence);
      if (safeOpeningSentences.length === 5) {
        break;
      }
    }

    if (safeOpeningSentences.length === 5) {
      break;
    }
  }

  if (safeOpeningSentences.length < 2) {
    return paragraphs;
  }

  const mergedSentenceCount = Math.min(safeOpeningSentences.length, 3);
  const mergedOpeningParagraph = safeOpeningSentences.slice(0, mergedSentenceCount).join(" ");
  const rebuiltParagraphs = [mergedOpeningParagraph];
  let sentencesRemainingToConsume = mergedSentenceCount;

  for (const paragraph of paragraphs) {
    const sentences = splitIntoSentences(paragraph);
    if (sentencesRemainingToConsume > 0) {
      if (sentences.length <= sentencesRemainingToConsume) {
        sentencesRemainingToConsume -= sentences.length;
        continue;
      }

      rebuiltParagraphs.push(sentences.slice(sentencesRemainingToConsume).join(" "));
      sentencesRemainingToConsume = 0;
      continue;
    }

    rebuiltParagraphs.push(paragraph);
  }

  return dedupeParagraphs(rebuiltParagraphs);
}

function buildSolvePathParagraphs(puzzle: PuzzleDetailRecord): string[] {
  const paragraphs: string[] = [];
  const usedWrongGuessLabels = new Set<string>();

  if (puzzle.solvePath?.firstRead) {
    paragraphs.push(puzzle.solvePath.firstRead);
  }

  puzzle.solvePath?.falseStarts.forEach((guess, index) => {
    const explanation = puzzle.solvePath?.whyFalseStartPlausible[index];
    usedWrongGuessLabels.add(guess.trim().toLowerCase());
    paragraphs.push(
      explanation
        ? `A believable early read was "${guess}". ${explanation}`
        : `A believable early read was "${guess}".`,
    );
  });

  puzzle.wrongGuessCandidates.forEach((candidate) => {
    const normalizedLabel = candidate.label.trim().toLowerCase();
    if (!normalizedLabel || usedWrongGuessLabels.has(normalizedLabel)) {
      return;
    }
    usedWrongGuessLabels.add(normalizedLabel);
    paragraphs.push(
      candidate.whyRejected
        ? `Another nearby read was "${candidate.label}". ${candidate.whyPlausible} ${candidate.whyRejected}`
        : `Another nearby read was "${candidate.label}". ${candidate.whyPlausible}`,
    );
  });

  if (puzzle.turningPoint?.clue) {
    const clue = puzzle.turningPoint.clue;
    const why = puzzle.turningPoint.whyDecisive?.trim();
    const normalizedWhy = why?.toLowerCase() ?? "";
    const normalizedClue = clue.trim().toLowerCase();

    // Avoid "X was the turning clue. X is the turning point..." style repetition.
    if (why && normalizedWhy.startsWith(normalizedClue)) {
      paragraphs.push(why);
    } else if (why) {
      paragraphs.push(`${clue} was the turning clue. ${why}`);
    } else {
      paragraphs.push(`${clue} was the turning clue.`);
    }
  } else if (puzzle.solvePath?.breakingClue) {
    paragraphs.push(`${puzzle.solvePath.breakingClue} was the clue that tightened the board.`);
  }

  if (puzzle.turningPoint?.whatChangedAfterIt) {
    paragraphs.push(puzzle.turningPoint.whatChangedAfterIt);
  }

  if (puzzle.solvePath?.fullBoardConfirmation) {
    paragraphs.push(puzzle.solvePath.fullBoardConfirmation);
  }

  if (puzzle.setValidationSummary) {
    paragraphs.push(puzzle.setValidationSummary);
  }

  if (puzzle.categoryPrecisionNote) {
    paragraphs.push(`That is why the board resolves as ${puzzle.categoryPrecisionNote}.`);
  }

  return dedupeParagraphs(paragraphs);
}

function tightenWalkthroughParagraphs(paragraphs: string[], puzzle: PuzzleDetailRecord): string[] {
  if (paragraphs.length <= 4) return paragraphs;

  const answer = puzzle.answer.trim().toLowerCase();
  const clueNeedle = puzzle.clues.map((clue) => clue.trim().toLowerCase()).filter(Boolean);

  const kept = paragraphs.filter((paragraph, index) => {
    if (index === paragraphs.length - 1) return true; // keep the closing line

    const trimmed = paragraph.trim();
    const lower = trimmed.toLowerCase();
    if (answer && lower.includes(answer)) return true;
    if (/(the answer (?:is|was)|once\b)/i.test(trimmed)) return true;
    if (trimmed.length >= 140) return true;

    const mentionsClue = clueNeedle.some((clue) => clue && lower.includes(clue));
    if (mentionsClue && /(made sense|fit|worked|clicked|lands?|confirm|narrow)/i.test(trimmed)) {
      return true;
    }

    return false;
  });

  const unique = dedupeParagraphs(kept);
  // If we filtered too aggressively, keep the original text.
  return unique.length >= 3 ? unique : paragraphs;
}

function renderClueTable(puzzle: PuzzleDetailRecord) {
  if (puzzle.clueRows.length === puzzle.clues.length && puzzle.clueRows.length > 0) {
    return (
      <div className="legacy-clue-table-shell">
        <div className="legacy-table-kicker-row">
          <Table className="legacy-section-icon" aria-hidden />
          <h3 className="legacy-table-kicker">Words &amp; How They Fit</h3>
        </div>
        <div className="legacy-clue-table-scroll">
          <table
            className="legacy-clue-table"
            aria-label="Detailed breakdown of each clue word, example read, and explanation"
          >
            <caption className="sr-only">
              Detailed breakdown of each clue word, example read, and explanation
            </caption>
            <thead>
              <tr>
                <th scope="col">Clue Word</th>
                <th scope="col">Phrase / Example</th>
                <th scope="col">Meaning &amp; Usage</th>
              </tr>
            </thead>
            <tbody>
              {puzzle.clueRows.map((row) => (
                <tr key={row.clue}>
                  <th scope="row">{row.clue}</th>
                  <td>{row.phraseExample || row.searchableContext || row.resolvedPhraseOrMember}</td>
                  <td>{row.nonObviousWhy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const rows = puzzle.display.clueTableRows;
  return (
    <div className="legacy-clue-table-shell">
      <div className="legacy-table-kicker-row">
        <Table className="legacy-section-icon" aria-hidden />
        <h3 className="legacy-table-kicker">Words & How They Fit</h3>
      </div>
      <div className="legacy-clue-table-scroll">
        <table
          className="legacy-clue-table"
          aria-label="Detailed breakdown of each clue word, example read, and explanation"
        >
          <caption className="sr-only">
            Detailed breakdown of each clue word, example read, and explanation
          </caption>
          <thead>
            <tr>
              <th scope="col">Clue Word</th>
              <th scope="col">Example Read</th>
              <th scope="col">Connection Explained</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.clue}>
                <th scope="row">{row.clue}</th>
                <td>{`"${row.examplePhrase}"`}</td>
                <td>{row.connectionExplained}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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

function renderNearbyReadCards(puzzle: PuzzleDetailRecord) {
  if (puzzle.wrongGuessCandidates.length === 0) {
    return null;
  }

  return (
    <div className="legacy-nearby-read-grid">
      {puzzle.wrongGuessCandidates.map((candidate) => (
        <article className="legacy-nearby-read-card" key={candidate.label}>
          <p className="legacy-nearby-read-label">{candidate.label}</p>
          <p className="legacy-nearby-read-copy">{candidate.whyPlausible}</p>
          {candidate.whyRejected ? (
            <p className="legacy-nearby-read-copy legacy-nearby-read-copy-strong">
              {candidate.whyRejected}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function renderPrecisionSection(puzzle: PuzzleDetailRecord) {
  if (!puzzle.setValidationSummary && !puzzle.categoryPrecisionNote) {
    return null;
  }

  return (
    <div className="legacy-precision-shell">
      {puzzle.setValidationSummary ? (
        <p className="legacy-precision-summary">{puzzle.setValidationSummary}</p>
      ) : null}
      {puzzle.categoryPrecisionNote ? (
        <p className="legacy-precision-note">
          {`Why the answer is tighter: ${puzzle.categoryPrecisionNote}.`}
        </p>
      ) : null}
    </div>
  );
}

export function PuzzleFullAnalysis({
  puzzle,
  recentPuzzles,
  nextPreview,
  adjacentPrev,
  adjacentNext,
  latestPuzzle,
}: {
  puzzle: PuzzleDetailRecord;
  recentPuzzles: ArchiveEntry[];
  nextPreview: NextPreview | null;
  adjacentPrev: ArchiveEntry | null;
  adjacentNext: ArchiveEntry | null;
  latestPuzzle: LatestAnswerCtaPuzzle | null;
}) {
  const isShortMode = puzzle.detailMode === "short";
  const isLightExplainerMode = puzzle.pageExperienceMode === "light-explainer";
  const isFallbackShortMode = isShortMode && (puzzle.detailSource === "fallback" || isLightExplainerMode);
  const phraseToken = getSharedPhraseToken(puzzle.answer);
  const solvePathParagraphs = dedupeParagraphs(
    buildSolvePathParagraphs(puzzle).map((paragraph) => applyClueCasing(paragraph, puzzle.clues, phraseToken)),
  );
  const walkthroughSourceParagraphs = buildWalkthroughParagraphs(puzzle).map((paragraph) =>
    applyClueCasing(paragraph, puzzle.clues, phraseToken),
  );
  const walkthroughParagraphs = dedupeParagraphs(
    isShortMode ? tightenWalkthroughParagraphs(walkthroughSourceParagraphs, puzzle) : walkthroughSourceParagraphs,
  );
  const normalizedWalkthroughParagraphs = mergeOpeningParagraphBlock(walkthroughParagraphs, puzzle);
  const visibleFaqEntries = getVisibleDetailFaqEntries(puzzle.faqItems, puzzle.faqs, puzzle.detailMode);
  const analysisTitle = isShortMode
    ? `Pinpoint ${puzzle.number} Quick Guide`
    : `Pinpoint ${puzzle.number} Answer & Full Analysis`;
  const analysisMetaLine = isFallbackShortMode
    ? puzzle.detailSource === "fallback"
      ? "Auto-generated quick guide from live puzzle data"
      : "Compact explainer published from verified puzzle data"
    : isShortMode
      ? "Compact guide for a clean, obvious pattern puzzle"
      : "By Pinpoint Answer Today";
  const evidenceMetaLine = [
    formatPuzzleQuestionTypeLabel(puzzle.questionType),
    formatPuzzleDifficultyBandLabel(puzzle.difficultyBand),
    puzzle.turningPoint?.clue ? `Turning clue: ${puzzle.turningPoint.clue}` : null,
  ].filter(Boolean).join(" · ");
  const shortModeLeadParagraphs = mergeOpeningParagraphBlock(
    solvePathParagraphs.length > 0 ? solvePathParagraphs : normalizedWalkthroughParagraphs,
    puzzle,
  );
  const previewCtaLabel = nextPreview
    ? `Pro Tips & Puzzle #${nextPreview.number} preview - expected ${nextPreview.expectedDate}`
    : "Open Pro Tips and spoiler-safe next puzzle guidance";
  return (
    <>
      <div className="legacy-analysis-flow">
        <section className="legacy-analysis-shell" id="analysis">
          <header className="legacy-analysis-header">
            <div className="legacy-analysis-meta">
              <p className="legacy-analysis-meta-line">{analysisMetaLine}</p>
              <p className="legacy-analysis-meta-line">{`Published on ${formatPublishedDate(puzzle.isoDate)}`}</p>
              {!isFallbackShortMode ? (
                <p className="legacy-analysis-meta-line">{evidenceMetaLine}</p>
              ) : null}
            </div>
            <div className="legacy-analysis-header-inner">
              <Star className="legacy-section-icon" aria-hidden />
              <h2 className="legacy-analysis-title">{analysisTitle}</h2>
            </div>
          </header>

          {isFallbackShortMode ? (
            <>
              <section className="legacy-analysis-section">
                <div className="legacy-prose-stack">
                  <p>{`Quick read: ${puzzle.display.connectorSummary}.`}</p>
                  <p>{`Fast strategy: ${puzzle.display.fastStrategy}.`}</p>
                  <p>
                    {`The answer is ${puzzle.answer}. Use the table below to check each clue, then skim the compact FAQ for the quickest path to the connection.`}
                  </p>
                </div>
              </section>

              <section className="legacy-analysis-section">
                {renderClueTable(puzzle)}
              </section>

              <section className="legacy-analysis-section" id="faq">
                <div className="legacy-section-title-row">
                  <Lightbulb className="legacy-section-icon" aria-hidden />
                  <h3 className="legacy-section-title">Compact FAQ</h3>
                </div>
                <div className="legacy-faq-stack">
                  {renderFaqCards(visibleFaqEntries)}
                </div>
              </section>
            </>
          ) : isShortMode ? (
            <>
              <section className="legacy-analysis-section">
                <div className="legacy-prose-stack">
                  {shortModeLeadParagraphs.map((paragraph, index) => (
                    <p key={`${puzzle.slug}-walkthrough-${index}`}>{paragraph}</p>
                  ))}
                </div>
              </section>

              <section className="legacy-analysis-section">
                {renderClueTable(puzzle)}
              </section>

              <section className="legacy-analysis-section" id="faq">
                <div className="legacy-section-title-row">
                  <Lightbulb className="legacy-section-icon" aria-hidden />
                  <h3 className="legacy-section-title">Compact FAQ</h3>
                </div>
                <div className="legacy-faq-stack">
                  {renderFaqCards(visibleFaqEntries)}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="legacy-analysis-section">
                <div className="legacy-prose-stack">
                  {normalizedWalkthroughParagraphs.map((paragraph, index) => (
                    <p key={`${puzzle.slug}-walkthrough-${index}`}>{paragraph}</p>
                  ))}
                </div>
              </section>

              <section className="legacy-analysis-section">
                <div className="legacy-section-title-row">
                  <Lightbulb className="legacy-section-icon" aria-hidden />
                  <h3 className="legacy-section-title">Solved Connection</h3>
                </div>
                <p className="legacy-category-answer">{puzzle.answer}</p>
              </section>

              {puzzle.wrongGuessCandidates.length > 0 ? (
                <section className="legacy-analysis-section">
                  <div className="legacy-section-title-row">
                    <Lightbulb className="legacy-section-icon" aria-hidden />
                    <h3 className="legacy-section-title">Nearby Reads We Ruled Out</h3>
                  </div>
                  {renderNearbyReadCards(puzzle)}
                </section>
              ) : null}

              {puzzle.setValidationSummary || puzzle.categoryPrecisionNote ? (
                <section className="legacy-analysis-section">
                  <div className="legacy-section-title-row">
                    <Star className="legacy-section-icon" aria-hidden />
                    <h3 className="legacy-section-title">Why This Answer Fits Tighter</h3>
                  </div>
                  {renderPrecisionSection(puzzle)}
                </section>
              ) : null}

              <section className="legacy-analysis-section">
                {renderClueTable(puzzle)}
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

              <section className="legacy-analysis-section" id="faq">
                <div className="legacy-section-title-row">
                  <Lightbulb className="legacy-section-icon" aria-hidden />
                  <h3 className="legacy-section-title">FAQ</h3>
                </div>
                <div className="legacy-faq-stack">
                  {renderFaqCards(visibleFaqEntries)}
                </div>
              </section>
            </>
          )}
        </section>

        <aside className="legacy-next-shell" aria-label="Recent Pinpoint answer pages">
          <h2 className="legacy-next-title">Recent Pinpoint answer pages</h2>
          <LatestAnswerCta currentSlug={puzzle.slug} latestPuzzle={latestPuzzle} />
          <Link className="legacy-next-link" href={routes.preview}>
            {previewCtaLabel}
          </Link>
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
            <Link className="button-secondary" href={routes.preview}>
              Open Pro Tips
            </Link>
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
