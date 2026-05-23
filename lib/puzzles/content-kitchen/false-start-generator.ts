import type { FullAnalysisFalseStartGenerationResult } from "./types";

export function generateFullAnalysisFalseStart(): FullAnalysisFalseStartGenerationResult {
  return {
    falseStart: {
      status: "omitted",
    },
    reasonCodes: ["NO_SUPPORTED_FALSE_START_EVIDENCE"],
  };
}
