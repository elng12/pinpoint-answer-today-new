import { type ContentContractInput, promotePublishBlockingIssues, validateContentContract } from "./content-contract";
import { buildPinpointDescription, buildPinpointTitle } from "../seo/pinpoint";

type PublishedDetail = {
  bodyMode?: ContentContractInput["bodyMode"];
  articleBlocks?: string[];
  solutionNarrative?: string[];
  wrongGuessCandidates?: ContentContractInput["wrongGuesses"];
  clueRows?: Array<{ clue?: string; resolvedPhraseOrMember?: string; nonObviousWhy?: string }>;
  lessons?: Array<string | { title?: string; body?: string }>;
  faqItems?: ContentContractInput["faqs"];
  faqs?: ContentContractInput["faqs"];
  llmTemplateVersion?: string;
};

// Validate the fields readers actually receive, not the discarded draft overview.
export function publishedContentIssues(
  entry: { puzzleNumber: number; clues: string[]; mainAnswer: string; shortSummary?: string },
  detail: PublishedDetail,
  bodyParagraphs = detail.articleBlocks ?? [],
) {
  return promotePublishBlockingIssues(validateContentContract({
    puzzleNumber: entry.puzzleNumber,
    bodyMode: detail.bodyMode,
    locale: "en",
    rawWords: entry.clues,
    mainAnswer: entry.mainAnswer,
    summary: entry.shortSummary,
    seoTitle: buildPinpointTitle(entry.puzzleNumber, entry.clues),
    seoDescription: buildPinpointDescription(entry.puzzleNumber, entry.clues),
    overview: bodyParagraphs[0] || entry.shortSummary,
    solutionEmergence: (detail.solutionNarrative ?? []).join(" ") || bodyParagraphs.slice(1, 3).join(" "),
    articleBlocks: bodyParagraphs,
    wrongGuesses: detail.wrongGuessCandidates,
    clueDetails: (detail.clueRows ?? []).map(row => ({ clue: row.clue, phrase: row.resolvedPhraseOrMember, explanation: row.nonObviousWhy })),
    lessons: (detail.lessons ?? []).map(lesson => {
      if (typeof lesson !== "string") return { title: lesson.title ?? "", body: lesson.body ?? "" };
      const index = lesson.indexOf(". ");
      const title = index > 0 ? lesson.slice(0, index).trim() : "";
      return { title, body: title && lesson.startsWith(`${title}. `) ? lesson.slice(title.length + 2).trim() : lesson };
    }),
    faqs: detail.faqItems?.length ? detail.faqItems : detail.faqs,
    llmTemplateVersion: detail.llmTemplateVersion,
  })).filter(issue => issue.level === "error");
}
