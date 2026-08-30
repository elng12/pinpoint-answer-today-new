export type CandidatePayloadEquivalenceInput = {
  slug?: string;
  publishDate?: string;
  candidateDetail?: unknown;
  mainDetail?: unknown;
  candidateRegistry?: unknown;
  mainRegistry?: unknown;
};

export type CandidatePayloadEquivalenceResult = {
  equivalent: boolean;
  reason: string;
};

export declare function assessCandidatePayloadOnMain(
  input?: CandidatePayloadEquivalenceInput,
): CandidatePayloadEquivalenceResult;
