export const EVIDENCE_CONTRACT = {
  clueRowsRequired: 5,
  turningPointMinWords: 8,
  clueExplanationMinWords: 8,
  faqItemsMin: 3,
  faqAnswerMinWords: 8,
  uniquenessAngleMinWords: 5,
  uniquenessListMin: 3,
} ;

const GENERIC_EVIDENCE_MARKERS = [
  "same answer",
  "same board",
  "same frame",
  "same category",
  "same set",
  "same theme",
  "same pattern",
  "same connector",
  "same shared",
  "same word",
  "one answer instead of",
  "part of the same answer",
  "points back to the same",
];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeLoose(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["“”'’()\-_,!?:.;/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value) {
  return normalizeText(value).match(/\S+/g)?.length ?? 0;
}

function mentionsLoose(text, target) {
  const normalizedText = normalizeLoose(text);
  const normalizedTarget = normalizeLoose(target);
  if (!normalizedText || !normalizedTarget) return false;
  return normalizedText.includes(normalizedTarget);
}

function containsGenericEvidenceMarker(value) {
  const normalized = normalizeLoose(value);
  if (!normalized) return false;
  return GENERIC_EVIDENCE_MARKERS.some((marker) => normalized.includes(marker));
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const key = normalizeLoose(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizeStringArray(values) {
  return Array.isArray(values) ? values.map((value) => normalizeText(value)).filter(Boolean) : [];
}

function pushIssue(issues, level, code, message, field) {
  issues.push({ level, code, message, ...(field ? { field } : {}) });
}

export function hasEvidenceContractPayload(input) {
  return Boolean(
    normalizeText(input?.questionType) ||
      normalizeText(input?.difficultyBand) ||
      input?.solvePath ||
      input?.turningPoint ||
      (Array.isArray(input?.clueRows) && input.clueRows.length > 0) ||
      (Array.isArray(input?.faqItems) && input.faqItems.length > 0) ||
      input?.uniquenessSignals,
  );
}

export function validateEvidenceContract(input, options = {}) {
  const issues = [];
  const clues = normalizeStringArray(input?.rawWords);
  const requireEvidenceFields = Boolean(options.requireEvidenceFields);
  const questionType = normalizeText(input?.questionType);
  const difficultyBand = normalizeText(input?.difficultyBand);
  const solvePath = input?.solvePath || null;
  const turningPoint = input?.turningPoint || null;
  const clueRows = Array.isArray(input?.clueRows) ? input.clueRows : [];
  const faqItems = Array.isArray(input?.faqItems) ? input.faqItems : [];
  const uniquenessSignals = input?.uniquenessSignals || null;
  const shouldValidate = requireEvidenceFields || hasEvidenceContractPayload(input);

  if (!shouldValidate) {
    return issues;
  }

  if (!questionType) {
    pushIssue(issues, "error", "evidence.questionType.missing", "questionType is required once v2 evidence fields are present", "questionType");
  }

  if (!difficultyBand) {
    pushIssue(issues, "error", "evidence.difficultyBand.missing", "difficultyBand is required once v2 evidence fields are present", "difficultyBand");
  }

  if (!solvePath) {
    pushIssue(issues, "error", "evidence.solvePath.missing", "solvePath is required once v2 evidence fields are present", "solvePath");
  } else {
    const falseStarts = normalizeStringArray(solvePath.falseStarts);
    const whyFalseStartPlausible = normalizeStringArray(solvePath.whyFalseStartPlausible);

    if (!normalizeText(solvePath.firstRead)) {
      pushIssue(issues, "error", "evidence.solvePath.firstRead.missing", "solvePath.firstRead must describe the opening board read", "solvePath.firstRead");
    }

    if (falseStarts.length > 0 && whyFalseStartPlausible.length < falseStarts.length) {
      pushIssue(
        issues,
        "error",
        "evidence.solvePath.falseStarts.reasonCount",
        "solvePath.whyFalseStartPlausible should explain every false start",
        "solvePath.whyFalseStartPlausible",
      );
    }

    if (difficultyBand && difficultyBand !== "obvious" && falseStarts.length === 0) {
      pushIssue(
        issues,
        "warning",
        "evidence.solvePath.falseStarts.thin",
        "medium/hard boards should usually preserve at least one believable false start",
        "solvePath.falseStarts",
      );
    }

    if (normalizeText(solvePath.breakingClue) && clues.length > 0 && !clues.some((clue) => mentionsLoose(solvePath.breakingClue, clue))) {
      pushIssue(
        issues,
        "error",
        "evidence.solvePath.breakingClue.invalid",
        "solvePath.breakingClue must point to a real clue",
        "solvePath.breakingClue",
      );
    }
  }

  if (!turningPoint) {
    pushIssue(issues, "error", "evidence.turningPoint.missing", "turningPoint is required once v2 evidence fields are present", "turningPoint");
  } else {
    const turningClue = normalizeText(turningPoint.clue);
    if (!turningClue) {
      pushIssue(issues, "error", "evidence.turningPoint.clue.missing", "turningPoint.clue is required", "turningPoint.clue");
    } else if (clues.length > 0 && !clues.some((clue) => mentionsLoose(turningClue, clue))) {
      pushIssue(issues, "error", "evidence.turningPoint.clue.invalid", "turningPoint.clue must name one of the real clues", "turningPoint.clue");
    }

    if (countWords(turningPoint.whyDecisive) < EVIDENCE_CONTRACT.turningPointMinWords) {
      pushIssue(
        issues,
        "error",
        "evidence.turningPoint.whyDecisive.thin",
        `turningPoint.whyDecisive should be at least ${EVIDENCE_CONTRACT.turningPointMinWords} words`,
        "turningPoint.whyDecisive",
      );
    }

    if (countWords(turningPoint.whatChangedAfterIt) < EVIDENCE_CONTRACT.turningPointMinWords) {
      pushIssue(
        issues,
        "error",
        "evidence.turningPoint.whatChangedAfterIt.thin",
        `turningPoint.whatChangedAfterIt should be at least ${EVIDENCE_CONTRACT.turningPointMinWords} words`,
        "turningPoint.whatChangedAfterIt",
      );
    }

    if (
      containsGenericEvidenceMarker(turningPoint.whyDecisive) &&
      !mentionsLoose(turningPoint.whyDecisive, turningClue)
    ) {
      pushIssue(
        issues,
        "warning",
        "evidence.turningPoint.whyDecisive.generic",
        "turningPoint.whyDecisive sounds generic and should explain why this specific clue tightens the board",
        "turningPoint.whyDecisive",
      );
    }

    if (
      solvePath &&
      normalizeText(solvePath.breakingClue) &&
      turningClue &&
      normalizeLoose(solvePath.breakingClue) !== normalizeLoose(turningClue)
    ) {
      pushIssue(
        issues,
        "error",
        "evidence.turningPoint.breakingClueMismatch",
        "solvePath.breakingClue and turningPoint.clue should agree",
        "solvePath.breakingClue",
      );
    }
  }

  if (clues.length > 0 && clueRows.length !== clues.length) {
    pushIssue(
      issues,
      "error",
      "evidence.clueRows.count",
      `clueRows must include exactly ${clues.length} items`,
      "clueRows",
    );
  }

  let phraseExpansions = 0;
  clueRows.forEach((row, index) => {
    const clue = normalizeText(row?.clue);
    const expectedClue = clues[index] || "";
    const resolvedPhrase = normalizeText(row?.resolvedPhraseOrMember);
    const nonObviousWhy = normalizeText(row?.nonObviousWhy);
    const fieldPrefix = `clueRows[${index}]`;

    if (expectedClue && normalizeLoose(clue) !== normalizeLoose(expectedClue)) {
      pushIssue(
        issues,
        "error",
        "evidence.clueRows.order",
        `clueRows must stay in clue order; expected "${expectedClue}" at position ${index + 1}`,
        `${fieldPrefix}.clue`,
      );
    }

    if (countWords(nonObviousWhy) < EVIDENCE_CONTRACT.clueExplanationMinWords) {
      pushIssue(
        issues,
        "error",
        "evidence.clueRows.nonObviousWhy.thin",
        `clueRows[${index}].nonObviousWhy should be at least ${EVIDENCE_CONTRACT.clueExplanationMinWords} words`,
        `${fieldPrefix}.nonObviousWhy`,
      );
    } else if (
      containsGenericEvidenceMarker(nonObviousWhy) &&
      !mentionsLoose(nonObviousWhy, clue) &&
      !mentionsLoose(nonObviousWhy, resolvedPhrase)
    ) {
      pushIssue(
        issues,
        "warning",
        "evidence.clueRows.nonObviousWhy.generic",
        "clueRows.nonObviousWhy should explain this clue specifically, not just repeat a generic board-level phrase",
        `${fieldPrefix}.nonObviousWhy`,
      );
    }

    if (questionType === "phrase" && resolvedPhrase && normalizeLoose(resolvedPhrase) !== normalizeLoose(clue)) {
      phraseExpansions += 1;
    }
  });

  if (questionType === "phrase" && clueRows.length > 0 && phraseExpansions < Math.min(3, clueRows.length)) {
    pushIssue(
      issues,
      "warning",
      "evidence.clueRows.phraseTooLiteral",
      "phrase boards should usually show explicit resolved phrases for most clue rows",
      "clueRows",
    );
  }

  if (faqItems.length < EVIDENCE_CONTRACT.faqItemsMin) {
    pushIssue(
      issues,
      "error",
      "evidence.faqItems.count",
      `faqItems should include at least ${EVIDENCE_CONTRACT.faqItemsMin} entries`,
      "faqItems",
    );
  }

  const seenFaqQuestions = new Set();
  let clueBackgroundCount = 0;
  let turningPointFaqCount = 0;
  faqItems.forEach((item, index) => {
    const fieldPrefix = `faqItems[${index}]`;
    const normalizedQuestion = normalizeLoose(item?.question);
    const tiedClue = normalizeText(item?.tiedClue);
    const intentType = normalizeText(item?.intentType);

    if (countWords(item?.answer) < EVIDENCE_CONTRACT.faqAnswerMinWords) {
      pushIssue(
        issues,
        "error",
        "evidence.faqItems.answer.thin",
        `faqItems[${index}].answer should be at least ${EVIDENCE_CONTRACT.faqAnswerMinWords} words`,
        `${fieldPrefix}.answer`,
      );
    }

    if (normalizedQuestion) {
      if (seenFaqQuestions.has(normalizedQuestion)) {
        pushIssue(
          issues,
          "warning",
          "evidence.faqItems.question.duplicate",
          "faqItems should avoid repeating the same question wording",
          `${fieldPrefix}.question`,
        );
      }
      seenFaqQuestions.add(normalizedQuestion);
    }

    if (tiedClue && clues.length > 0 && !clues.some((clue) => mentionsLoose(tiedClue, clue))) {
      pushIssue(
        issues,
        "error",
        "evidence.faqItems.tiedClue.invalid",
        "faqItems.tiedClue must point to a real clue",
        `${fieldPrefix}.tiedClue`,
      );
    }

    if (intentType === "clue_background") {
      clueBackgroundCount += 1;
      if (!tiedClue) {
        pushIssue(
          issues,
          "error",
          "evidence.faqItems.clueBackground.tiedClueMissing",
          "clue_background FAQ items must include tiedClue",
          `${fieldPrefix}.tiedClue`,
        );
      }
      if (
        turningPoint?.clue &&
        tiedClue &&
        normalizeLoose(tiedClue) === normalizeLoose(turningPoint.clue)
      ) {
        turningPointFaqCount += 1;
      }
    }
  });

  if (clueBackgroundCount === 0) {
    pushIssue(
      issues,
      "error",
      "evidence.faqItems.clueBackground.missing",
      "faqItems should include at least one clue-specific background question",
      "faqItems",
    );
  } else if (turningPoint?.clue && turningPointFaqCount === 0) {
    pushIssue(
      issues,
      "warning",
      "evidence.faqItems.turningPointCoverage.missing",
      "faqItems should usually include one clue-specific question tied to the turning clue",
      "faqItems",
    );
  }

  if (!uniquenessSignals) {
    pushIssue(
      issues,
      "warning",
      "evidence.uniquenessSignals.missing",
      "uniquenessSignals should be present once v2 evidence fields are present",
      "uniquenessSignals",
    );
  } else {
    if (countWords(uniquenessSignals.angle) < EVIDENCE_CONTRACT.uniquenessAngleMinWords) {
      pushIssue(
        issues,
        "warning",
        "evidence.uniquenessSignals.angle.thin",
        `uniquenessSignals.angle should be at least ${EVIDENCE_CONTRACT.uniquenessAngleMinWords} words`,
        "uniquenessSignals.angle",
      );
    }

    if (uniqueNonEmpty(uniquenessSignals.relatedEntities).length < EVIDENCE_CONTRACT.uniquenessListMin) {
      pushIssue(
        issues,
        "warning",
        "evidence.uniquenessSignals.relatedEntities.thin",
        `uniquenessSignals.relatedEntities should include at least ${EVIDENCE_CONTRACT.uniquenessListMin} distinct entries`,
        "uniquenessSignals.relatedEntities",
      );
    }

    if (uniqueNonEmpty(uniquenessSignals.doNotRepeatPatterns).length < EVIDENCE_CONTRACT.uniquenessListMin) {
      pushIssue(
        issues,
        "warning",
        "evidence.uniquenessSignals.doNotRepeatPatterns.thin",
        `uniquenessSignals.doNotRepeatPatterns should include at least ${EVIDENCE_CONTRACT.uniquenessListMin} distinct entries`,
        "uniquenessSignals.doNotRepeatPatterns",
      );
    }
  }

  return issues;
}
