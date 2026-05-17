import { NextRequest, NextResponse } from "next/server";
import type { PuzzleDataForAI } from "@/lib/puzzle-generation";
import { normalizeAnswerLabel } from "@/lib/puzzles/content-contract";
import {
  validateDraftInputLanguage,
  validateDraftLanguage,
  validateDraftStructure,
} from "@/lib/puzzles/draft-validator";

const ADMIN_TOKENS = [
  process.env.API_SECRET_TOKEN,
  process.env.ADMIN_PASSPHRASE,
  process.env.NODE_ENV === "production" ? null : "admin-secret-dev",
].filter(Boolean);

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
    const authHeader = req.headers.get("authorization");
    const adminPassHeader = req.headers.get("x-admin-pass");
    const token = authHeader?.replace("Bearer ", "") || adminPassHeader;

    if (!token || !ADMIN_TOKENS.includes(token)) {
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

    const structureIssues = validateDraftStructure(puzzleData, candidate);
    const languageIssues = validateDraftLanguage(candidate);
    const allIssues = [...structureIssues, ...languageIssues];
    const errorIssues = allIssues.filter((issue) => issue.level === "error");

    return NextResponse.json({
      valid: errorIssues.length === 0,
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
