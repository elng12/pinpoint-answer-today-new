import { getPuzzleBySlug, getPuzzleSlugByPublishDate } from "@/lib/puzzles/data";

export type WorkerFallbackAnswer = {
  rank: number;
  word: string;
};

export type WorkerFallbackMode = "auto" | "local" | "competitor";

export type WorkerFallbackPayload = {
  source: "fallback-local" | "fallback-competitor";
  theme: string;
  mainAnswer: string;
  answers: WorkerFallbackAnswer[];
};

type CompetitorSnapshot = {
  clue1?: unknown;
  clue2?: unknown;
  clue3?: unknown;
  clue4?: unknown;
  clue5?: unknown;
  answer?: unknown;
  createdAt?: unknown;
};

const COMPETITOR_CLUE_KEYS = ["clue1", "clue2", "clue3", "clue4", "clue5"] as const;
const COMPETITOR_TODAY_BLOCK_MARKER = '\\"todayPinpointData\\":{';
const DEFAULT_COMPETITOR_URL = "https://pinpointanswer.today/";

function normalizeAnswerWords(words: string[]): WorkerFallbackAnswer[] {
  return words.map((word, index) => ({
    rank: index + 1,
    word,
  }));
}

function normalizeDate(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function addUtcDays(date: string, deltaDays: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  return parsed.toISOString().slice(0, 10);
}

function normalizedWordSignature(words: string[]): string {
  return words
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0)
    .join("|");
}

function normalizedAnswerText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function getSnapshotIsoDate(snapshot: CompetitorSnapshot): string | null {
  const raw = typeof snapshot.createdAt === "string" ? snapshot.createdAt.trim() : "";
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function normalizeWorkerFallbackMode(input: unknown): WorkerFallbackMode {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (value === "local" || value === "competitor") return value;
  return "auto";
}

export async function loadBundledWorkerFallback(date: string): Promise<WorkerFallbackPayload | null> {
  const isoDate = normalizeDate(date);
  if (!isoDate) return null;

  const slug = await getPuzzleSlugByPublishDate(isoDate, { allowLiveWorkerFallback: false });
  if (!slug) return null;

  const puzzle = await getPuzzleBySlug(slug, { allowLiveWorkerFallback: false });
  if (!puzzle) return null;

  const words = puzzle.clues
    .map((word) => String(word || "").trim())
    .filter((word) => word.length > 0);

  if (words.length !== 5 || !puzzle.answer.trim()) return null;

  return {
    source: "fallback-local",
    theme: puzzle.answer.trim(),
    mainAnswer: puzzle.answer.trim(),
    answers: normalizeAnswerWords(words),
  };
}

function normalizeCompetitorUrl(input: string | undefined): string {
  const raw = String(input || "").trim() || DEFAULT_COMPETITOR_URL;
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function extractCompetitorTodayBlock(html: string): CompetitorSnapshot {
  const markerIndex = html.indexOf(COMPETITOR_TODAY_BLOCK_MARKER);
  if (markerIndex === -1) {
    throw new Error("todayPinpointData block not found");
  }

  const jsonStart = markerIndex + COMPETITOR_TODAY_BLOCK_MARKER.length - 1;
  let depth = 0;
  let endIndex = -1;

  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        endIndex = index;
        break;
      }
    }
  }

  if (endIndex === -1) {
    throw new Error("todayPinpointData block was not closed properly");
  }

  const rawObject = html.slice(jsonStart, endIndex + 1);
  const candidates = [
    rawObject,
    rawObject.replace(/\\\\\"/g, '\\"'),
    rawObject.replace(/\\\\\"/g, '\\"').replace(/\\"/g, '"'),
    rawObject.replace(/\\"/g, '"'),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as CompetitorSnapshot;
    } catch {
      // Try the next escape-normalization candidate.
    }
  }

  throw new Error("todayPinpointData JSON could not be parsed");
}

function extractCompetitorClues(snapshot: CompetitorSnapshot): string[] {
  return COMPETITOR_CLUE_KEYS.map((key) => snapshot[key])
    .map((value) => (typeof value === "string" ? value.trim() : String(value ?? "").trim()))
    .filter((value) => value.length > 0);
}

async function isSameAsPreviousBundledFallback(date: string, answers: string[], mainAnswer: string): Promise<boolean> {
  const isoDate = normalizeDate(date);
  if (!isoDate) return false;

  const previousPayload = await loadBundledWorkerFallback(addUtcDays(isoDate, -1));
  if (!previousPayload) return false;

  const previousAnswers = previousPayload.answers.map((answer) => answer.word);
  const sameAnswers = normalizedWordSignature(answers) === normalizedWordSignature(previousAnswers);
  const sameMainAnswer =
    normalizedAnswerText(mainAnswer).length > 0 &&
    normalizedAnswerText(mainAnswer) === normalizedAnswerText(previousPayload.mainAnswer || previousPayload.theme);

  return sameAnswers && sameMainAnswer;
}

export async function loadCompetitorWorkerFallback(date?: string): Promise<WorkerFallbackPayload> {
  const targetUrl = normalizeCompetitorUrl(process.env.PINPOINT_BASE_URL);
  const timeoutMs = Number.parseInt(process.env.COMPETITOR_FETCH_TIMEOUT_MS ?? "30000", 10);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          process.env.PINPOINT_FETCH_UA ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        "Accept-Language": process.env.PINPOINT_FETCH_LANG || "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`competitor fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    const snapshot = extractCompetitorTodayBlock(html);
    const answers = extractCompetitorClues(snapshot);
    const mainAnswer =
      typeof snapshot.answer === "string" ? snapshot.answer.trim() : String(snapshot.answer ?? "").trim();

    if (answers.length !== 5 || !mainAnswer) {
      throw new Error(
        `competitor snapshot invalid (answers=${answers.length}, theme=${mainAnswer ? "ok" : "missing"})`,
      );
    }

    const snapshotDate = getSnapshotIsoDate(snapshot);
    if (date && snapshotDate && snapshotDate !== date) {
      throw new Error(`competitor snapshot date ${snapshotDate} does not match requested date ${date}`);
    }

    if (date && (await isSameAsPreviousBundledFallback(date, answers, mainAnswer))) {
      throw new Error("competitor snapshot still matches previous day");
    }

    return {
      source: "fallback-competitor",
      theme: mainAnswer,
      mainAnswer,
      answers: normalizeAnswerWords(answers),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`competitor fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
