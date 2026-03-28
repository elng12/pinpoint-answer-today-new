export const EVIDENCE_CONTRACT: {
  readonly clueRowsRequired: 5;
  readonly turningPointMinWords: 8;
  readonly clueExplanationMinWords: 8;
  readonly faqItemsMin: 3;
  readonly faqAnswerMinWords: 8;
  readonly uniquenessAngleMinWords: 5;
  readonly uniquenessListMin: 3;
};

export type EvidenceContractIssueLevel = "error" | "warning";

export type EvidenceContractIssue = {
  level: EvidenceContractIssueLevel;
  code: string;
  message: string;
  field?: string;
};

export type EvidenceContractInput = {
  rawWords?: string[] | null;
  mainAnswer?: string | null;
  questionType?: string | null;
  difficultyBand?: string | null;
  solvePath?:
    | {
        firstRead?: string | null;
        falseStarts?: string[] | null;
        whyFalseStartPlausible?: string[] | null;
        breakingClue?: string | null;
        pivot?: string | null;
        fullBoardConfirmation?: string | null;
      }
    | null;
  turningPoint?:
    | {
        clue?: string | null;
        whyDecisive?: string | null;
        whatChangedAfterIt?: string | null;
      }
    | null;
  clueRows?:
    | Array<{
        clue?: string | null;
        surfaceMisread?: string | null;
        resolvedPhraseOrMember?: string | null;
        nonObviousWhy?: string | null;
        searchableContext?: string | null;
      }>
    | null;
  faqItems?:
    | Array<{
        intentType?: string | null;
        question?: string | null;
        answer?: string | null;
        tiedClue?: string | null;
      }>
    | null;
  uniquenessSignals?:
    | {
        angle?: string | null;
        relatedEntities?: string[] | null;
        doNotRepeatPatterns?: string[] | null;
      }
    | null;
};

export type EvidenceContractOptions = {
  requireEvidenceFields?: boolean;
};

export function hasEvidenceContractPayload(input: EvidenceContractInput | null | undefined): boolean;
export function validateEvidenceContract(
  input: EvidenceContractInput | null | undefined,
  options?: EvidenceContractOptions,
): EvidenceContractIssue[];
