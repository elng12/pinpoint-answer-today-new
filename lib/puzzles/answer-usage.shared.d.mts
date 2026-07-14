export type ExactAnswerUsageInput = {
  mainAnswer?: string | null;
  summary?: string | null;
  overview?: string | null;
  solutionEmergence?: string | null;
  wrongGuesses?: Array<{
    guess?: string | null;
    explanation?: string | null;
  }> | null;
  clueDetails?: Array<{
    phrase?: string | null;
    explanation?: string | null;
  }> | null;
  lessons?: Array<{
    title?: string | null;
    body?: string | null;
  }> | null;
  faqs?: Array<{
    question?: string | null;
    answer?: string | null;
  }> | null;
};

export type ExactAnswerUsageIssue = {
  code: "answer.overused";
  count: number;
  limit: number;
  message: string;
};

export declare const MAX_EXACT_ANSWER_MENTIONS: number;
export declare function countExactAnswerMentions(input?: ExactAnswerUsageInput): number;
export declare function getExactAnswerUsageIssue(input?: ExactAnswerUsageInput): ExactAnswerUsageIssue | null;
