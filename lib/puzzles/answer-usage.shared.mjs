export const MAX_EXACT_ANSWER_MENTIONS = 3;

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countOccurrences(haystack, needle) {
  if (!haystack || !needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = haystack.match(new RegExp(`\\b${escaped}\\b`, "g"));
  return matches?.length ?? 0;
}

export function countExactAnswerMentions(input = {}) {
  const normalizedAnswer = normalizeForMatch(input.mainAnswer);
  if (!normalizedAnswer) return 0;

  const values = [
    input.summary,
    input.overview,
    input.solutionEmergence,
    ...(Array.isArray(input.wrongGuesses)
      ? input.wrongGuesses.flatMap((item) => [item?.guess, item?.explanation])
      : []),
    ...(Array.isArray(input.clueDetails)
      ? input.clueDetails.flatMap((item) => [item?.phrase, item?.explanation])
      : []),
    ...(Array.isArray(input.lessons)
      ? input.lessons.flatMap((item) => [item?.title, item?.body])
      : []),
    ...(Array.isArray(input.faqs)
      ? input.faqs.flatMap((item) => [item?.question, item?.answer])
      : []),
  ];

  return values
    .map((value) => countOccurrences(normalizeForMatch(value), normalizedAnswer))
    .reduce((total, count) => total + count, 0);
}

export function getExactAnswerUsageIssue(input = {}) {
  const count = countExactAnswerMentions(input);
  if (count <= MAX_EXACT_ANSWER_MENTIONS) return null;

  return {
    code: "answer.overused",
    count,
    limit: MAX_EXACT_ANSWER_MENTIONS,
    message: `Exact answer text appears too many times (${count}) across the draft`,
  };
}
