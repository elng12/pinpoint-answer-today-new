import { NextRequest, NextResponse } from "next/server";
import {
  normalizeGeneratedPuzzleContent,
  type PuzzleDataForAI,
} from "@/lib/puzzle-generation";
import { normalizeAnswerLabel } from "@/lib/puzzles/content-contract";
import {
  validateDraftInputLanguage,
  validateDraftLanguage,
  validateDraftStructure,
} from "@/lib/puzzles/draft-validator";
import { authenticateAdmin } from "@/lib/site/admin-auth";
import { enforceAdminRateLimit } from "@/lib/site/admin-rate-limit";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function hasMinimumSlotsForNormalization(candidate: unknown): boolean {
  const root = asRecord(candidate);
  const slots = asRecord(root?.slots);
  if (!slots) return false;

  const clueDetails = Array.isArray(slots.clueDetails) ? slots.clueDetails : [];
  const hasCompleteClueDetails =
    clueDetails.length === 5 &&
    clueDetails.every((item) => {
      const detail = asRecord(item);
      return Boolean(
        asNonEmptyString(detail?.clue) &&
          asNonEmptyString(detail?.surfaceRead) &&
          asNonEmptyString(detail?.phrase) &&
          asNonEmptyString(detail?.whyItWorks),
      );
    });

  return Boolean(
    asNonEmptyString(slots.heroIntroSpoilerSafe) &&
      asNonEmptyString(slots.connectorSummary) &&
      asNonEmptyString(slots.turningPoint) &&
      hasCompleteClueDetails,
  );
}

/**
 * POST /api/admin/validate-draft
 *
 * Lightweight validation endpoint that checks an AI-generated draft against
 * content/evidence/slot contracts. Does NOT call any LLM — the caller (Worker)
 * has already done that.
 *
 * Body:
 *   { puzzleNumber, rawWords, mainAnswer, candidate }
 *
 * Returns:
 *   { valid: boolean, issues: ContentContractIssue[] }
 */
export async function POST(req: NextRequest) {
  try {
    const rateLimited = enforceAdminRateLimit(req);
    if (rateLimited) return rateLimited;

    const authHeader = req.headers.get("authorization");
    const adminPassHeader = req.headers.get("x-admin-pass");
    const token = authHeader?.replace("Bearer ", "") || adminPassHeader;

    if (!token || !authenticateAdmin(token)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      puzzleNumber?: string | number;
      rawWords?: string[];
      mainAnswer?: string;
      candidate?: unknown;
    };

    const { puzzleNumber, rawWords, mainAnswer, candidate } = body;

    if (!puzzleNumber || !rawWords || !mainAnswer || !candidate) {
      return NextResponse.json(
        { message: "Missing required fields: puzzleNumber, rawWords, mainAnswer, candidate" },
        { status: 400 },
      );
    }

    const puzzleData: PuzzleDataForAI = {
      puzzleNumber: Number(puzzleNumber),
      rawWords,
      mainAnswer: normalizeAnswerLabel(mainAnswer),
    };

    const inputLanguageIssues = validateDraftInputLanguage(puzzleData);
    if (inputLanguageIssues.length > 0) {
      return NextResponse.json({
        valid: false,
        message: "Input contains non-English characters",
        issues: inputLanguageIssues,
      });
    }

    let normalizedCandidate = candidate;
    if (hasMinimumSlotsForNormalization(candidate)) {
      try {
        normalizedCandidate = normalizeGeneratedPuzzleContent(candidate, puzzleData);
      } catch (normalizationError) {
        console.warn(
          "[API] Validate Draft normalization skipped:",
          normalizationError instanceof Error ? normalizationError.message : String(normalizationError),
        );
      }
    }

    const structureIssues = validateDraftStructure(puzzleData, normalizedCandidate);
    const languageIssues = validateDraftLanguage(normalizedCandidate);
    const allIssues = [...structureIssues, ...languageIssues];
    const errorIssues = allIssues.filter((issue) => issue.level === "error");

    return NextResponse.json({
      valid: errorIssues.length === 0,
      candidate: normalizedCandidate,
      issues: allIssues,
    });
  } catch (error) {
    console.error("[API] Validate Draft Error:", error);
    return NextResponse.json(
      {
        valid: false,
        message: error instanceof Error ? error.message : "Internal Server Error",
        issues: [{ level: "error", code: "internal", message: String(error) }],
      },
      { status: 500 },
    );
  }
}
