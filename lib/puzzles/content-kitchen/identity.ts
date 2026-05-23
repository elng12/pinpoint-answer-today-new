import { createHash } from "node:crypto";
import type { CanonicalConfig, L1PuzzleInput } from "./types";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export function normalizeIdentityText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeIdentityMatch(value: unknown): string {
  return normalizeIdentityText(value).toLowerCase();
}

function normalizeSlugSegment(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "unknown";
}

export function buildCanonicalSlug(l1Input: Pick<L1PuzzleInput, "puzzleId" | "puzzleNumber" | "logicalGameDate">): string {
  if (Number.isInteger(l1Input.puzzleNumber) && Number(l1Input.puzzleNumber) > 0) {
    return `pinpoint-answer-${l1Input.puzzleNumber}`;
  }

  const datePart = normalizeSlugSegment(l1Input.logicalGameDate);
  const puzzleIdPart = normalizeSlugSegment(l1Input.puzzleId);
  return `pinpoint-answer-${datePart}-${puzzleIdPart}`;
}

function encodePathBySegment(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildCanonicalUrl(config: CanonicalConfig, slug: string): string {
  const baseUrl = config.siteBaseUrl.trim().replace(/\/+$/g, "");
  const routePrefix = `/${config.detailRoutePrefix.split("/").filter(Boolean).join("/")}`;
  const encodedSlug = encodePathBySegment(slug);
  const path = `${routePrefix}/${encodedSlug}`.replace(/\/{2,}/g, "/");
  return `${baseUrl}${path}/`;
}

function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key] as JsonValue)}`);
  return `{${entries.join(",")}}`;
}

export function hashInputSnapshot(l1Input: Partial<L1PuzzleInput>): string {
  const hashInput: JsonValue = {
    puzzleId: normalizeIdentityText(l1Input.puzzleId),
    puzzleNumber: typeof l1Input.puzzleNumber === "number" ? l1Input.puzzleNumber : null,
    logicalGameDate: normalizeIdentityText(l1Input.logicalGameDate),
    source: normalizeIdentityText(l1Input.source),
    answer: normalizeIdentityText(l1Input.answer),
    clues: Array.isArray(l1Input.clues)
      ? l1Input.clues.map((clue) => ({
          clueId: normalizeIdentityText(clue.clueId),
          text: normalizeIdentityText(clue.text),
          position: typeof clue.position === "number" ? clue.position : null,
        }))
      : [],
  };

  return `sha256:${createHash("sha256").update(stableJson(hashInput), "utf8").digest("hex")}`;
}
