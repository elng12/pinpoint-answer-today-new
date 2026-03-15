import { getPuzzleBySlug, getPuzzleSlugByPublishDate } from "@/lib/puzzles/data";

export type WorkerFallbackAnswer = {
  rank: number;
  word: string;
};

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

export async function loadBundledWorkerFallback(date: string): Promise<WorkerFallbackPayload | null> {
  const isoDate = normalizeDate(date);
  if (!isoDate) return null;

  const slug = await getPuzzleSlugByPublishDate(isoDate);
  if (!slug) return null;

  const puzzle = await getPuzzleBySlug(slug);
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

export async function loadCompetitorWorkerFallback(): Promise<WorkerFallbackPayload> {
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
