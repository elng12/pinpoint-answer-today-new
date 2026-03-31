import {
  AUTO_LOCALE_PUBLISH_FREEZE_SHORT_REASON,
  getLocaleAutoPublishFreeze,
} from "./lib/publish/locale-auto-publish-freeze";
import { resolveAutoI18nEnabled } from "./lib/publish/auto-i18n-policy";
import {
  buildSharedFallbackArticleBlocks,
  buildSharedFallbackFaqs,
  buildSharedFallbackLessons,
  buildSharedFallbackSolutionNarrative,
} from "../../lib/puzzles/fallback-copy";
import { getPinpointUnlockUtcHour } from "../../lib/utils/pinpoint-unlock";

export interface Env {
  PP_DATA: KVNamespace;
  GRAPHQL_ENDPOINT?: string;   // e.g. https://your-upstream/graphql
  GRAPHQL_TOKEN?: string;      // optional: Bearer token
  GRAPHQL_COOKIE?: string;     // optional: raw cookie string, e.g. "li_at=...; other=..."
  VOYAGER_GRAPHQL_ENDPOINT?: string; // LinkedIn Voyager GraphQL upstream, e.g. https://www.linkedin.com/voyager/api/graphql
  ADMIN_SECRET?: string;       // admin secret for protected endpoints
  FALLBACK_WEBHOOK?: string;   // optional: fallback webhook URL
  FALLBACK_WEBHOOK_SECRET?: string; // optional: webhook shared secret

  ADMIN_PUT_DOC_ENABLED?: string; // 'true' 才启用
  ADMIN_PUT_DOC_SECRET?: string;  // 单独密钥，未设置则回退到 ADMIN_SECRET
  ENVIRONMENT?: string;           // 'production' 时强制关闭
  ALLOW_SELF_GRAPHQL?: string;    // 'true' 明确允许 self://graphql mock

  PUT_DOC_RATE_PER_MIN?: string;  // 每分钟次数上限
  PUT_DOC_RATE_PER_DAY?: string;  // 每日次数上限
  FEISHU_WEBHOOK_URL?: string;    // optional: cron notify webhook
  SLACK_WEBHOOK_URL?: string;     // optional: cron notify webhook
  ALERT_WEBHOOK_URL?: string;     // optional: cron notify webhook (legacy alias)
  SITE_BASE_URL?: string;         // optional: publish target site base URL
  SITE_API_TOKEN?: string;        // optional: bearer token for /api/publish and /api/admin/generate-draft
  AUTO_PUBLISH_ENABLED?: string;  // optional: set "false" to disable quick publish
  AUTO_ENRICH_ENABLED?: string;   // optional: set "false" to disable async enrich
  AUTO_PUBLISH_TIMEOUT_MS?: string; // optional: timeout for quick publish requests
  AUTO_ENRICH_TIMEOUT_MS?: string;  // optional: timeout for async enrich requests
  AUTO_ENRICH_DRAFT_ATTEMPTS?: string; // optional: retry count when enrich draft is blocked by quality gates
  AUTO_ENRICH_RETRY_MODEL?: string; // optional: alternate model used on regenerate attempts after the first
  AUTO_I18N_ENABLED?: string;       // optional: set "true" to enable localized async publish
  AUTO_I18N_LOCALES?: string;       // optional: comma list, e.g. "fr,de,pt-BR"
  AUTO_I18N_PARALLEL?: string;      // optional: concurrent locale jobs
  AUTO_I18N_TIMEOUT_MS?: string;    // optional: timeout for localize requests
  AUTO_ENRICH_MODEL?: string;       // optional: explicit model override for enrich draft
  AUTO_I18N_MODEL?: string;         // optional: explicit model override for i18n localize draft

  // New site (pinpoint-answer-today-new) GitHub publishing
  GITHUB_TOKEN_NEW_SITE?: string;        // Classic PAT with repo scope
  GITHUB_REPO_NEW_SITE?: string;         // e.g. elng12/pinpoint-answer-today-new
  GITHUB_BRANCH_NEW_SITE?: string;       // default: main
  NEW_SITE_URL?: string;                 // e.g. https://pinpointanswertoday.app (new site)
  NEW_SITE_REVALIDATE_SECRET?: string;   // matches REVALIDATE_SECRET on Vercel
  NEW_SITE_LIVE_REFRESH_ENABLED?: string; // optional: set "true" to allow worker-triggered live refresh fallback
}

type Answer = { rank: number; word: string; confidence?: number };
type DocSource = "graphql" | "fallback-webhook" | "fallback-local" | "fallback-competitor";
type Doc = {
  version: 1;
  puzzleDate: string;
  answers: Answer[];
  source: DocSource;
  fetchedAt: string
  checksum: string;
  theme?: string;
  mainAnswer?: string;
};

type JsonRecord = Record<string, unknown>;

type GraphQLOperation = {
  isPrimary?: boolean;
  operationName?: string;
  variables?: JsonRecord;
  sha256Hash?: string;
};

type GraphQLOperationsConfig = {
  operations?: GraphQLOperation[];
};

type GraphQLAnswer = {
  rank?: unknown;
  word?: unknown;
  confidence?: unknown;
};

type GraphQLPayload = {
  data?: {
    pinpoint?: {
      answers?: GraphQLAnswer[];
      theme?: unknown;
      answer?: { theme?: unknown; text?: unknown };
      finalAnswer?: unknown;
      board?: { theme?: unknown };
      mainAnswer?: unknown;
      clues?: unknown[];
      categoryTitle?: unknown;
      category?: unknown;
    };
    theme?: unknown;
    answer?: { theme?: unknown; text?: unknown };
    board?: { theme?: unknown };
    finalAnswer?: unknown;
  };
  answers?: GraphQLAnswer[];
  theme?: unknown;
  finalAnswer?: unknown;
  mainAnswer?: unknown;
  clues?: unknown[];
};

type FallbackPayload = {
  answers?: GraphQLAnswer[];
  theme?: unknown;
  mainAnswer?: unknown;
  source?: unknown;
  mode?: unknown;
  date?: unknown;
};

type FallbackMode = "auto" | "local" | "competitor";

type GraphQLProxyBody = {
  query?: unknown;
  variables?: unknown;
  operationName?: unknown;
  extensions?: unknown;
};

type PutDocPayload = {
  theme?: unknown;
  mainAnswer?: unknown;
  answers?: unknown;
  [key: string]: unknown;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function toParagraphs(value: unknown, fallback: string): string[] {
  if (Array.isArray(value)) {
    const arrayParagraphs = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    if (arrayParagraphs.length > 0) {
      return arrayParagraphs;
    }
  }
  const source = String(value || fallback).trim();
  if (!source) return [fallback.trim()].filter(Boolean);
  const paragraphs = source
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [source];
}

function buildWorkerArticleBreakdown(
  puzzleNumber: number,
  words: string[],
  answer: string,
  turningPoint: string,
): string {
  const pattern = detectWorkerAnswerPattern(answer);
  const connectorSummary = buildWorkerConnectorSummary(answer);
  const sampleReads = words
    .slice(0, 2)
    .map((word) => buildWorkerFallbackPhrase(word, answer));
  const finalChecks = words.slice(-2);
  const paragraphs = buildSharedFallbackArticleBlocks({
    kind: pattern.kind,
    clues: words,
    answer: `"${answer}"`,
    turningPoint,
    connectorSummary,
    sampleReads,
    finalChecks,
  });

  return paragraphs.join("\n\n");
}

/**
 * Builds a first-person article-style walkthrough from available clue data
 * when the AI-generated detailedBreakdown/overview is missing or too thin.
 */
function buildFallbackAnalysis(
  puzzleNumber: number,
  words: string[],
  answer: string,
  clueDetails: Array<Record<string, unknown>>,
): string {
  const turningPoint =
    clueDetails.find((detail) => typeof detail?.clue === "string" && typeof detail?.explanation === "string")
      ?.clue as string | undefined;
  return buildWorkerArticleBreakdown(
    puzzleNumber,
    words,
    answer,
    turningPoint || pickWorkerTurningPoint(words, answer),
  );
}

function toAnswers(raw: unknown): Answer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const row = asRecord(item);
      const rank = Number(row?.rank ?? index + 1) || index + 1;
      const word = decodeHtmlish(String(row?.word ?? "")).trim();
      const confidenceRaw = row?.confidence;
      const confidence = confidenceRaw != null ? Number(confidenceRaw) : undefined;
      return {
        rank,
        word,
        confidence,
      };
    })
    .filter((item) => item.word.length > 0);
}

const keyOf = (d: string) => `pinpoint:${d}`;
const quickPublishKeyOf = (d: string) => `publish:${d}:quick_done`;
const enrichPublishDoneKeyOf = (d: string) => `publish:${d}:enrich_done`;
const enrichPublishRunningKeyOf = (d: string) => `publish:${d}:enrich_running`;
const newSiteLiveRefreshDoneKeyOf = (d: string, signature: string) => `publish:${d}:new_site_live:${signature}:done`;
const newSiteLiveRefreshRunningKeyOf = (d: string, signature: string) => `publish:${d}:new_site_live:${signature}:running`;
const i18nPublishDoneKeyOf = (d: string, locale: string) => `publish:${d}:i18n:${locale}:done`;
const i18nPublishRunningKeyOf = (d: string, locale: string) => `publish:${d}:i18n:${locale}:running`;
const cronHeartbeatLatestKey = "monitor:cron:last";
const cronHeartbeatDayKeyOf = (d: string) => `monitor:cron:${d}`;
const cronHeartbeatDayRunsKeyOf = (d: string) => `monitor:cron:${d}:runs`;
const cronHeartbeatRunKeyOf = (runId: string) => `monitor:cron:run:${runId}`;
const cronHeartbeatRunsLimit = 20;
const nonPublicDetailStateAlertThresholdMs = 15 * 60 * 1000;

const SUPPORTED_I18N_LOCALES = ["fr", "de", "pt-BR"] as const;
const I18N_LOCALE_SET = new Set<string>(SUPPORTED_I18N_LOCALES);
const I18N_SUMMARY_MIN_WORDS = 20;
const PUBLISH_SHORT_TEXT_MAX_CHARS = 500;
const PUBLISH_SECTION_TEXT_MAX_CHARS = 4000;
const BEIJING_TIME_ZONE = "Asia/Shanghai";

const MS_IN_DAY = 86_400_000;
const BASELINE_NUMBER = 536;
const BASELINE_DATE_UTC = Date.UTC(2025, 9, 18); // 2025-10-18

type QuickPublishResult = {
  status: "published" | "skipped";
  puzzleNumber?: number;
  reason?: string;
};

type PublicDetailState = "published" | "fallback_full";
type PublishDetailState = PublicDetailState | "generating" | "validated" | "failed";
type DetailQuestionType = "phrase" | "category" | "association" | "hybrid";
type DetailDifficultyBand = "obvious" | "medium" | "hard";
type WorkerTurningPointRecord = {
  clue: string;
  whyDecisive: string;
  whatChangedAfterIt: string;
};
type WorkerSolvePathRecord = {
  firstRead: string;
  falseStarts: string[];
  whyFalseStartPlausible: string[];
  breakingClue?: string;
  pivot?: string;
  fullBoardConfirmation?: string;
};
type WorkerClueRow = {
  clue: string;
  surfaceMisread: string;
  resolvedPhraseOrMember: string;
  nonObviousWhy: string;
  searchableContext: string;
};
type WorkerFaqItem = {
  intentType: "definition" | "clue_background" | "comparison" | "solve_strategy" | "category_context";
  question: string;
  answer: string;
  tiedClue: string | null;
};
type WorkerUniquenessSignals = {
  angle: string;
  relatedEntities: string[];
  doNotRepeatPatterns: string[];
};

type EnrichPublishResult = {
  status: "enriched" | "fallback_full" | "skipped";
  reason?: string;
  puzzleNumber?: number;
  payload?: JsonRecord;
  detailState?: PublicDetailState;
};

type EnrichPublishOptions = {
  onDetailStateChange?: (detailState: PublishDetailState, reason?: string) => Promise<void> | void;
};

type I18nPublishItemResult = {
  locale: string;
  status: "published" | "skipped" | "failed";
  reason?: string;
  durationMs: number;
  detailUrl: string;
};

type I18nPublishResult = {
  status: "completed" | "skipped";
  reason?: string;
  results: I18nPublishItemResult[];
};

type I18nPublishOptions = {
  enabled?: boolean;
};

type NewSiteLiveRefreshResult = {
  applied: boolean;
  alreadyDone?: boolean;
  detailUrl?: string;
  payload?: JsonRecord;
  puzzleNumber?: number;
};

type CronHeartbeatStageStatus = "unknown" | "queued" | "published" | "skipped" | "failed";

type CronHeartbeatStage = {
  status: CronHeartbeatStageStatus;
  reason?: string;
  detailState?: PublishDetailState;
  updatedAt: string;
};

type CronHeartbeatI18nStage = CronHeartbeatStage & {
  publishedCount?: number;
  failedCount?: number;
  skippedCount?: number;
};

type CronHeartbeatSource = "worker-scheduled" | "worker-admin-run";

type CronHeartbeatTriggerKind = "scheduled" | "manual";

type BuildCronHeartbeatOptions = {
  source?: CronHeartbeatSource;
  triggerKind?: CronHeartbeatTriggerKind;
  publishEnabled?: boolean;
  forcePublish?: boolean;
  requestId?: string;
};

type CronHeartbeat = {
  version: 1;
  runId: string;
  source: CronHeartbeatSource;
  triggerKind: CronHeartbeatTriggerKind;
  requestId?: string;
  date: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  durationMs?: number;
  triggerSeen: boolean;
  publishEnabled: boolean;
  forcePublish: boolean;
  outcome: "running" | "succeeded" | "failed" | "stale_skipped" | "not_ready";
  error?: string;
  quickPublish: CronHeartbeatStage;
  enrich: CronHeartbeatStage;
  i18n: CronHeartbeatI18nStage;
};

function envFlag(value: string | undefined, fallback = false): boolean {
  if (value == null || value.trim().length === 0) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeBaseUrl(input: string | undefined, fallback: string): string {
  const raw = String(input || fallback || "").trim();
  const withProtocol = /^https?:\/\//i.test(raw)
    ? raw
    : `https://${raw.replace(/^\/+/g, "")}`;
  return withProtocol.replace(/\/+$/, "");
}

function normalizeFallbackSource(raw: unknown): DocSource {
  const source = typeof raw === "string" ? raw.trim() : "";
  if (source === "fallback-local" || source === "fallback-competitor") {
    return source;
  }
  return "fallback-webhook";
}

function normalizeFallbackMode(raw: unknown): FallbackMode {
  const mode = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (mode === "local" || mode === "competitor") {
    return mode;
  }
  return "auto";
}

function hasNotifyWebhook(env: Env): boolean {
  return Boolean(
    String(env.FEISHU_WEBHOOK_URL || env.ALERT_WEBHOOK_URL || "").trim() ||
    String(env.SLACK_WEBHOOK_URL || "").trim(),
  );
}

function getFallbackModeLabel(mode: FallbackMode): string {
  if (mode === "local") return "本地兜底自测";
  if (mode === "competitor") return "竞争对手兜底自测";
  return "兜底自测";
}

function getFallbackSourceLabel(source: DocSource): string {
  if (source === "fallback-local") return "本地兜底";
  if (source === "fallback-competitor") return "竞争对手兜底";
  if (source === "fallback-webhook") return "fallback webhook";
  return "官方抓取";
}

function getPublicSiteBaseUrl(env: Env): string {
  return normalizeBaseUrl(env.NEW_SITE_URL, "https://pinpointanswertoday.app");
}

function getLegacySiteBaseUrl(env: Env): string | null {
  const raw = String(env.SITE_BASE_URL || "").trim();
  if (!raw) return null;
  const siteBaseUrl = normalizeBaseUrl(raw, "");
  if (!siteBaseUrl) return null;
  const publicSiteBaseUrl = getPublicSiteBaseUrl(env);
  return siteBaseUrl === publicSiteBaseUrl ? null : siteBaseUrl;
}

function getAdminSecret(env: Env): string | null {
  const secret = String(env.ADMIN_SECRET || "").trim();
  return secret.length > 0 ? secret : null;
}

function getAdminPutDocSecret(env: Env): string | null {
  const secret = String(env.ADMIN_PUT_DOC_SECRET || env.ADMIN_SECRET || "").trim();
  return secret.length > 0 ? secret : null;
}

function canUseStoredAdminDoc(env: Env): boolean {
  const branch = String(env.GITHUB_BRANCH_NEW_SITE || "main").trim();
  return !isPrimaryNewSiteBranch(branch);
}

function normalizeStoredDocAnswer(raw: unknown, index: number): Answer | null {
  const entry = asRecord(raw);
  const word = String(entry?.word || "").trim();
  if (!word) return null;
  const rankRaw = Number(entry?.rank);
  const confidenceRaw = Number(entry?.confidence);
  const rank = Number.isFinite(rankRaw) && rankRaw > 0 ? Math.trunc(rankRaw) : index + 1;
  return {
    rank,
    word,
    ...(Number.isFinite(confidenceRaw) ? { confidence: confidenceRaw } : {}),
  };
}

function parseStoredDoc(raw: string, fallbackDate: string): Doc {
  const parsed = asRecord(JSON.parse(raw));
  if (!parsed) {
    throw new Error("stored doc invalid");
  }

  const answersRaw = Array.isArray(parsed.answers) ? parsed.answers : [];
  const answers = answersRaw
    .map((item, index) => normalizeStoredDocAnswer(item, index))
    .filter((item): item is Answer => Boolean(item))
    .slice(0, 5);
  if (answers.length !== 5) {
    throw new Error(`stored doc answers length invalid (expected 5, got ${answers.length})`);
  }

  const puzzleDate = String(parsed.puzzleDate || fallbackDate).trim() || fallbackDate;
  const fetchedAt = String(parsed.fetchedAt || new Date().toISOString()).trim() || new Date().toISOString();
  const source = normalizeFallbackSource(parsed.source ?? "graphql");
  const checksum = String(parsed.checksum || "").trim();

  return {
    version: 1,
    puzzleDate,
    answers,
    source,
    fetchedAt,
    checksum: checksum || `sha256:stored:${puzzleDate}`,
    ...(typeof parsed.theme === "string" && parsed.theme.trim() ? { theme: parsed.theme.trim() } : {}),
    ...(typeof parsed.mainAnswer === "string" && parsed.mainAnswer.trim() ? { mainAnswer: parsed.mainAnswer.trim() } : {}),
  };
}

async function loadStoredDocForDate(env: Env, date: string): Promise<Doc | null> {
  const raw = await env.PP_DATA.get(keyOf(date));
  if (!raw) return null;
  return parseStoredDoc(raw, date);
}

function hasNewSiteRevalidateConfig(env: Env): boolean {
  return (
    String(env.NEW_SITE_URL || "").trim().length > 0 &&
    String(env.NEW_SITE_REVALIDATE_SECRET || "").trim().length > 0
  );
}

function shouldUseDirectNewSiteFallback(reason: string | undefined): boolean {
  const normalized = String(reason || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "legacy site pipeline unavailable") return true;
  if (normalized === "site api token missing") return true;
  if (normalized.includes("/api/publish failed (404)")) return true;
  if (normalized.includes("/api/admin/generate-draft") && normalized.includes("failed (404)")) return true;
  return false;
}

function isQuickPublishNonBlockingReason(reason: string | undefined): boolean {
  const normalized = String(reason || "").trim();
  return normalized === "quick publish already done today" || normalized === "legacy site pipeline unavailable";
}

function parseTimeoutMs(input: string | undefined, fallbackMs: number, minMs = 1000, maxMs = 120_000): number {
  const n = Number.parseInt(String(input || ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  return Math.min(maxMs, Math.max(minMs, n));
}

function isFinitePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function inferPuzzleNumber(rawPuzzleNumber: unknown, puzzleDate: string): number {
  if (isFinitePositiveInteger(rawPuzzleNumber)) {
    return rawPuzzleNumber;
  }

  if (typeof rawPuzzleNumber === "string") {
    const parsed = Number(rawPuzzleNumber.trim());
    if (isFinitePositiveInteger(parsed)) return parsed;
  }

  const parsedDate = new Date(`${puzzleDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Cannot infer puzzleNumber from invalid puzzleDate: ${puzzleDate}`);
  }

  const utc = Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate());
  const diffDays = Math.floor((utc - BASELINE_DATE_UTC) / MS_IN_DAY);
  if (diffDays < 0) {
    throw new Error(`Puzzle date ${puzzleDate} is before baseline date 2025-10-18`);
  }
  return BASELINE_NUMBER + diffDays;
}

function buildPublishedAtIso(puzzleDate: string, fetchedAt: string | undefined): string {
  const fromPuzzleDate = new Date(`${puzzleDate}T00:00:00.000Z`);
  if (!Number.isNaN(fromPuzzleDate.getTime())) {
    return fromPuzzleDate.toISOString();
  }
  const fromFetchedAt = new Date(String(fetchedAt || ""));
  if (!Number.isNaN(fromFetchedAt.getTime())) {
    return fromFetchedAt.toISOString();
  }
  return new Date().toISOString();
}

function extractWordsFromDoc(doc: Doc): string[] {
  const words = doc.answers
    .map((item) => String(item?.word || "").trim())
    .filter((item) => item.length > 0)
    .slice(0, 5);
  if (words.length !== 5) {
    throw new Error(`doc answers length invalid for publish (expected 5, got ${words.length})`);
  }
  return words;
}

function addUtcDays(date: string, deltaDays: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  return parsed.toISOString().slice(0, 10);
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

function getBeijingTodayDate(now = new Date()): string {
  return formatDateInTimeZone(now, BEIJING_TIME_ZONE);
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

function pluralizeTrailingWord(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1] || trimmed;
  const lowerLastWord = lastWord.toLowerCase();
  const irregularPlurals: Record<string, string> = {
    mouse: "mice",
    goose: "geese",
    tooth: "teeth",
    foot: "feet",
    man: "men",
    woman: "women",
    person: "people",
    child: "children",
  };

  let pluralLastWord = lastWord;
  if (irregularPlurals[lowerLastWord]) {
    pluralLastWord = irregularPlurals[lowerLastWord];
  } else if (/ies$/i.test(lastWord) || /s$/i.test(lastWord)) {
    pluralLastWord = lastWord;
  } else if (/[^aeiou]y$/i.test(lastWord)) {
    pluralLastWord = `${lastWord.slice(0, -1)}ies`;
  } else if (/(ch|sh|x|z|s)$/i.test(lastWord)) {
    pluralLastWord = `${lastWord}es`;
  } else {
    pluralLastWord = `${lastWord}s`;
  }

  return [...words.slice(0, -1), pluralLastWord].join(" ").trim();
}

function sanitizePublishedAnswerLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";

  if (/^Words that come (before|after)\b/i.test(text)) {
    return text;
  }

  const typedCategory = text.match(/^(Types|Kinds)\s+of\s+(.+)$/i);
  if (typedCategory?.[2]) {
    return `${typedCategory[1]} of ${pluralizeTrailingWord(typedCategory[2])}`.trim();
  }

  const strippedQualifier = text.replace(/\s*\((?:with|for|including)\b[^)]*\)\s*$/i, "").trim();
  if (strippedQualifier && strippedQualifier !== text) {
    return strippedQualifier;
  }

  const beforeSlash = text.split("/")[0]?.trim() || text;
  if (beforeSlash && beforeSlash !== text && beforeSlash.length >= 4) {
    return beforeSlash;
  }

  return text;
}

type WorkerAnswerPattern =
  | { kind: "before"; token: string }
  | { kind: "after"; token: string }
  | { kind: "typed-category"; noun: string; singularNoun: string }
  | { kind: "association"; subject: string }
  | { kind: "category"; label: string };

function stripStraightAndCurlyQuotes(value: string): string {
  return value.replace(/["“”]/g, "");
}

function singularizeTrailingWord(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1] || trimmed;
  const lowerLastWord = lastWord.toLowerCase();
  const irregularSingulars: Record<string, string> = {
    mice: "mouse",
    geese: "goose",
    teeth: "tooth",
    feet: "foot",
    men: "man",
    women: "woman",
    people: "person",
    children: "child",
  };

  let singularLastWord = lastWord;
  if (irregularSingulars[lowerLastWord]) {
    singularLastWord = irregularSingulars[lowerLastWord];
  } else if (/ies$/i.test(lastWord)) {
    singularLastWord = `${lastWord.slice(0, -3)}y`;
  } else if (/(ches|shes|xes|zes)$/i.test(lastWord)) {
    singularLastWord = lastWord.slice(0, -2);
  } else if (/s$/i.test(lastWord) && !/ss$/i.test(lastWord)) {
    singularLastWord = lastWord.slice(0, -1);
  }

  return [...words.slice(0, -1), singularLastWord].join(" ").trim();
}

function detectWorkerAnswerPattern(answer: string): WorkerAnswerPattern {
  const normalizedAnswer = sanitizePublishedAnswerLabel(answer);
  const before = normalizedAnswer.match(/^Words that come before\s+["“]?(.+?)["”]?$/i);
  if (before?.[1]) return { kind: "before", token: stripStraightAndCurlyQuotes(before[1]).trim() };

  const after = normalizedAnswer.match(/^Words that come after\s+["“]?(.+?)["”]?$/i);
  if (after?.[1]) return { kind: "after", token: stripStraightAndCurlyQuotes(after[1]).trim() };

  const typedCategory = normalizedAnswer.match(/^(Types|Kinds)\s+of\s+(.+)$/i);
  if (typedCategory?.[2]) {
    const noun = stripStraightAndCurlyQuotes(typedCategory[2]).trim();
    return {
      kind: "typed-category",
      noun,
      singularNoun: singularizeTrailingWord(noun) || noun,
    };
  }

  const association = normalizedAnswer.match(/^Things associated with\s+(.+)$/i);
  if (association?.[1]) {
    return {
      kind: "association",
      subject: stripStraightAndCurlyQuotes(association[1]).trim(),
    };
  }

  return {
    kind: "category",
    label: stripStraightAndCurlyQuotes(normalizedAnswer).replace(/\s*\([^)]*\)\s*$/, "").trim() || "shared category",
  };
}

function normalizeLooseWorkerText(value: string): string {
  return value
    .toLowerCase()
    .replace(/["“”'’()\-_,!?:.;/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractWorkerCategoryLabel(answer: string): string {
  const pattern = detectWorkerAnswerPattern(answer);
  if (pattern.kind === "typed-category") return pattern.noun.toLowerCase();
  if (pattern.kind === "association") return pattern.subject.toLowerCase();
  if (pattern.kind !== "category") return "";
  const firstWord = pattern.label.split(/\s+/)[0]?.trim().toLowerCase() || "";
  return firstWord.length > 2 ? firstWord : pattern.label.toLowerCase();
}

function buildWorkerConnectorSummary(answer: string): string {
  const pattern = detectWorkerAnswerPattern(answer);
  if (pattern.kind === "before") {
    return "familiar phrases completed by one shared ending word";
  }
  if (pattern.kind === "after") {
    return "familiar phrases and everyday terms built with one shared opening word";
  }
  if (pattern.kind === "typed-category") {
    return `a category board focused on ${pattern.noun.toLowerCase()}`;
  }
  if (pattern.kind === "association") {
    return `a board centered on the theme of ${pattern.subject}`;
  }
  const label = extractWorkerCategoryLabel(answer);
  return label
    ? `a category board focused on ${label}`
    : "a shared category board with one connector";
}

function buildWorkerSpecialPhrase(clue: string, answer: string): string {
  const pattern = detectWorkerAnswerPattern(answer);
  if (pattern.kind !== "before" && pattern.kind !== "after") return "";

  const symbolGroupPattern = /\(\s*[^\p{L}\p{N}]+\s*\)|[^\p{L}\p{N}\s()'"&,-]+/gu;
  const replaced = clue.replace(symbolGroupPattern, ` ${pattern.token} `).replace(/\s+/g, " ").trim();
  if (replaced === clue) return "";
  return stripStraightAndCurlyQuotes(replaced.replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim());
}

function buildWorkerFallbackPhrase(clue: string, answer: string): string {
  const pattern = detectWorkerAnswerPattern(answer);
  if (pattern.kind === "before") {
    return buildWorkerSpecialPhrase(clue, answer) || `${clue} ${pattern.token}`.trim();
  }
  if (pattern.kind === "after") {
    return buildWorkerSpecialPhrase(clue, answer) || `${pattern.token} ${clue}`.trim();
  }
  if (pattern.kind === "typed-category") {
    const baseClue = clue.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const normalizedBase = baseClue || clue;
    const baseLoose = normalizeLooseWorkerText(normalizedBase);
    const nounLoose = normalizeLooseWorkerText(pattern.singularNoun);
    if (nounLoose && baseLoose.includes(nounLoose)) return normalizedBase;
    return `${normalizedBase} ${pattern.singularNoun}`.trim();
  }
  return clue.trim();
}

function buildWorkerClueExplanation(clue: string, phrase: string, answer: string, index: number, turningPoint: string): string {
  const pattern = detectWorkerAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    const token = pattern.token;
    const phraseText = phrase || clue;
    const visualStyle = normalizeLooseWorkerText(clue) !== normalizeLooseWorkerText(phraseText) &&
      /[^\p{L}\p{N}\s()'"&,-]/u.test(clue);
    if (visualStyle) {
      return `The familiar expression "${phraseText}" makes the missing word "${token}" obvious in plain language.`;
    }
    const variants = [
      `"${phraseText}" is a familiar phrase, so it helps reveal the shared word quickly.`,
      `"${phraseText}" is common enough to confirm the same missing word without stretching the phrasing.`,
      `Once the shared word is in place, "${phraseText}" reads like ordinary language instead of a forced compound.`,
    ];
    return variants[index % variants.length] || variants[0];
  }

  if (pattern.kind === "typed-category") {
    const variants = [
      `"${phrase}" is a recognizable ${pattern.singularNoun.toLowerCase()}, so it gives the board a clean category fit.`,
      `Once the board is read as ${pattern.noun.toLowerCase()}, "${phrase}" stops feeling broad and becomes an exact fit.`,
      `"${phrase}" belongs in the same ${pattern.singularNoun.toLowerCase()} frame, which keeps the category specific instead of loose.`,
    ];
    return variants[index % variants.length] || variants[0];
  }

  if (pattern.kind === "association") {
    if (clue === turningPoint) {
      return `"${clue}" is one of the clearest anchors for a ${pattern.subject} reading, which is why it helps lock the board into place.`;
    }
    const variants = [
      `"${clue}" fits naturally once the board is read through ${pattern.subject} rather than as a loose general-interest category.`,
      `"${clue}" supports the same ${pattern.subject}-based frame as the other clues, so it reads as part of one picture instead of an isolated reference.`,
      `"${clue}" works because it points back to the same ${pattern.subject} context that ties the whole board together.`,
    ];
    return variants[index % variants.length] || variants[0];
  }

  if (clue === turningPoint) {
    return `"${clue}" is the clue that makes the shared answer concrete enough to test across the full board.`;
  }
  const variants = [
    `"${phrase}" fits more cleanly once the board is tested under the same answer as the other clues.`,
    `"${phrase}" helps confirm the same answer instead of pulling the board back toward a looser guess.`,
    `"${phrase}" belongs in the same set as the rest of the board, which is why the answer sharpens once this pattern becomes visible.`,
  ];
  return variants[index % variants.length] || variants[0];
}

function scoreWorkerClueSpecificity(clue: string): number {
  const text = clue.trim();
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  let score = text.length;
  score += words.length * 5;
  score += (text.match(/-/g)?.length || 0) * 6;
  score += (text.match(/\(/g)?.length || 0) * 4;
  score += /The\s+/i.test(text) ? 5 : 0;
  score += /\b(island|bridge|square|park|museum|tower|center|bay)\b/i.test(text) ? 8 : 0;
  return score;
}

function pickWorkerTurningPoint(words: string[], answer: string): string {
  const pattern = detectWorkerAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    const special = words.find((word) => buildWorkerSpecialPhrase(word, answer));
    if (special) return special;
  }

  let bestWord = words[0] || "the key clue";
  let bestScore = -1;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] || "";
    let score = scoreWorkerClueSpecificity(word) + index;
    if (
      pattern.kind === "association" &&
      /\b(square|island|bridge|park|museum|tower|center|bay)\b/i.test(word)
    ) {
      score += 10;
    }
    if (score > bestScore) {
      bestScore = score;
      bestWord = word;
    }
  }
  return bestWord;
}

function buildWorkerSpoilerHint(clue: string, answer: string, index: number, turningPoint: string): string {
  const pattern = detectWorkerAnswerPattern(answer);
  const isTurningPoint = clue === turningPoint;

  if (pattern.kind === "before" || pattern.kind === "after") {
    if (isTurningPoint) {
      return "This is the clue that makes the phrase pattern concrete enough to test without giving away the final connector.";
    }
    const hints = [
      "Try reading this as part of a familiar phrase instead of as a standalone word.",
      "This clue works better once you test a fixed phrase pattern rather than a broad topic.",
      "Look for a natural expression that absorbs this clue cleanly before locking the board.",
    ];
    return hints[index % hints.length] || hints[0];
  }

  if (pattern.kind === "typed-category") {
    if (isTurningPoint) {
      return "This is the clue that makes the category specific enough to verify across the whole board.";
    }
    const hints = [
      "Treat this as one recognizable member of a narrower set, not as a broad topic on its own.",
      "This clue helps more once you ask what kind of thing it is rather than where you have seen it before.",
      "Try reading this as a specific type inside one shelf instead of as a loose general reference.",
    ];
    return hints[index % hints.length] || hints[0];
  }

  if (pattern.kind === "association") {
    if (isTurningPoint) {
      return "This is the clue that turns a loose board into one specific setting or theme.";
    }
    const hints = [
      "Think about one shared setting or theme that can absorb this clue naturally.",
      "This clue points to the same world as the others once the frame gets specific enough.",
      "Treat this as one part of a bigger picture rather than as an isolated reference.",
    ];
    return hints[index % hints.length] || hints[0];
  }

  if (isTurningPoint) {
    return "This is the clue that makes the category specific enough to test instead of staying broad.";
  }

  const hints = [
    "Treat this as one member of a narrower category, not as a broad standalone topic.",
    "This clue becomes useful once you stop reading it literally and start testing one tighter set.",
    "Look for the cleaner category fit instead of the first broad topic that comes to mind.",
  ];
  return hints[index % hints.length] || hints[0];
}

function buildWorkerSpoilerHints(words: string[], answer: string): Record<string, string> {
  const turningPoint = pickWorkerTurningPoint(words, answer);
  return words.reduce<Record<string, string>>((accumulator, clue, index) => {
    accumulator[clue] = buildWorkerSpoilerHint(clue, answer, index, turningPoint);
    return accumulator;
  }, {});
}

function readWorkerLessonBody(lesson: unknown): string | undefined {
  if (typeof lesson === "string") {
    return asNonEmptyString(lesson);
  }

  const row = asRecord(lesson);
  return asNonEmptyString(row?.body) ?? asNonEmptyString(row?.title);
}

function buildWorkerFastStrategy(answer: string, lessons: unknown[]): string {
  const firstLessonBody = readWorkerLessonBody(lessons[0]);
  if (firstLessonBody) {
    return firstLessonBody;
  }

  const pattern = detectWorkerAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return "Test one shared word across two clues first, then verify that the same phrase logic survives all five.";
  }
  return "Wait for the clue that makes the category specific, then re-check the earlier clues under that tighter frame.";
}

function buildWorkerDisplay(
  words: string[],
  answer: string,
  wordHints: Record<string, string>,
  lessons: unknown[],
  clueDetails: Array<Record<string, unknown>>,
) {
  const turningPoint = pickWorkerTurningPoint(words, answer);
  const clueDetailsByClue = new Map<string, Record<string, unknown>>();
  clueDetails.forEach((detail) => {
    const clue = asNonEmptyString(detail.clue);
    if (clue) {
      clueDetailsByClue.set(clue, detail);
    }
  });

  return {
    connectorSummary: buildWorkerConnectorSummary(answer),
    fastStrategy: buildWorkerFastStrategy(answer, lessons),
    clueTableRows: words.map((clue, index) => {
      const detail = clueDetailsByClue.get(clue) ?? clueDetails[index];
      const examplePhrase = asNonEmptyString(detail?.phrase) ?? buildWorkerFallbackPhrase(clue, answer);
      return {
        clue,
        examplePhrase,
        connectionExplained:
          wordHints[clue] ?? buildWorkerClueExplanation(clue, examplePhrase, answer, index, turningPoint),
      };
    }),
  };
}

function buildTemplateFallbackPayload(
  siteBaseUrl: string,
  puzzleDate: string,
  doc: Doc,
  puzzleNumber: number,
  words: string[],
): JsonRecord {
  const answer = sanitizePublishedAnswerLabel(doc.mainAnswer || doc.theme || "Pinpoint connector") || "Pinpoint connector";
  const clueLabel = words.join(", ");
  const pattern = detectWorkerAnswerPattern(answer);
  const connectorSummary = buildWorkerConnectorSummary(answer);
  const turningPoint = pickWorkerTurningPoint(words, answer);
  const turningPhrase = buildWorkerFallbackPhrase(turningPoint, answer);
  const clueDetails = words.map((clue, index) => {
    const phrase = buildWorkerFallbackPhrase(clue, answer);
    return {
      clue,
      phrase,
      explanation: buildWorkerClueExplanation(clue, phrase, answer, index, turningPoint),
    };
  });

  const heroSummary =
    `Pinpoint Answer Today asks: what links ${clueLabel} - and what story do they share? ` +
    `The set starts with a few plausible directions before one clue makes the clean reading hard to miss.`;

  const overviewParagraphs =
    pattern.kind === "before" || pattern.kind === "after"
      ? [
          `At first, ${words.slice(0, 3).join(", ")} could have pointed toward a few different phrase guesses.`,
          `"${turningPoint}" is the clue that makes the missing word much easier to spot.`,
          `Once that phrase appears, ${connectorSummary} explains the whole set more cleanly than an early loose guess.`,
        ]
      : [
          `At first, ${words.slice(0, 3).join(", ")} do not point to one clean answer.`,
          `"${turningPoint}" is the clue that makes the shared idea concrete enough to test.`,
          `Once the board is read through ${connectorSummary}, the earlier clues stop feeling broad and start behaving like exact fits.`,
        ];

  const solutionParagraphs = [
    ...buildSharedFallbackSolutionNarrative({
      kind: pattern.kind,
      wrongGuess: pattern.kind === "before" || pattern.kind === "after"
        ? "loose phrase guesses"
        : "a broader category guess",
      turningPoint,
    }),
    `The answer was "${answer}".`,
  ];

  const detailedBreakdown = buildWorkerArticleBreakdown(puzzleNumber, words, answer, turningPoint);
  const solutionEmergence = solutionParagraphs.join("\n\n");
  const lessons = buildSharedFallbackLessons({ kind: pattern.kind, turningPoint });

  const faqs = buildSharedFallbackFaqs({
    puzzleNumber,
    kind: pattern.kind,
    answer: `"${answer}"`,
    turningPoint,
    connectorSummary,
    turningPhrase,
  });

  const articleBlocks = detailedBreakdown
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const sections = {
    articleBlocks,
    overview: detailedBreakdown,
    solutionEmergence,
    clueDetails,
    lessons,
    faqs,
  };
  const analysis = {
    answerGroups: [{ category: answer, words }],
    detailedBreakdown,
    dailyDebrief: `LinkedIn Pinpoint #${puzzleNumber} answer is ${answer}. Clues: ${clueLabel}.`,
    difficultyRating: 3,
    answerDescription: answer,
  };
  const detailRecord = buildPublishedPuzzleDetailRecord({
    puzzleNumber,
    slug: `pinpoint-answer-${puzzleNumber}`,
    puzzleDate,
    answer,
    words,
    sections,
    analysis,
    summary: heroSummary,
    detailState: "fallback_full",
  });

  return {
    puzzleNumber,
    rawWords: words,
    analysis,
    summary: heroSummary,
    mainAnswer: answer,
    sections,
    questionType: detailRecord.questionType,
    difficultyBand: detailRecord.difficultyBand,
    solvePath: detailRecord.solvePath,
    ...(detailRecord.turningPoint ? { turningPoint: detailRecord.turningPoint } : {}),
    clueRows: detailRecord.clueRows,
    faqItems: detailRecord.faqItems,
    uniquenessSignals: detailRecord.uniquenessSignals,
    publishedAtIso: buildPublishedAtIso(puzzleDate, doc.fetchedAt),
    metadata: {
      publishedAtSource: `${siteBaseUrl}/worker/template-fallback`,
      publishedAtConfidence: 0.7,
    },
  };
}

async function isLikelyStaleCandidate(
  env: Env,
  date: string,
  doc: Doc,
): Promise<{ stale: boolean; comparedDate?: string; reason?: string }> {
  const prevDate = addUtcDays(date, -1);
  const prevRaw = await env.PP_DATA.get(keyOf(prevDate));
  if (!prevRaw) {
    return { stale: false };
  }

  let prevJson: JsonRecord | null = null;
  try {
    prevJson = asRecord(JSON.parse(prevRaw));
  } catch {
    prevJson = null;
  }
  if (!prevJson) {
    return { stale: false };
  }

  const currentWords = extractWordsFromDoc(doc);
  const previousWords = toAnswers(prevJson.answers).map((answer) => answer.word).slice(0, 5);
  if (previousWords.length !== 5) {
    return { stale: false };
  }

  const sameWordSet = normalizedWordSignature(currentWords) === normalizedWordSignature(previousWords);
  const currentMain = normalizedAnswerText(doc.mainAnswer || doc.theme);
  const previousMain = normalizedAnswerText(prevJson.mainAnswer || prevJson.theme);
  const sameMainAnswer = currentMain.length > 0 && currentMain === previousMain;
  const sameChecksum = String(prevJson.checksum || "").trim() === String(doc.checksum || "").trim();

  if (sameWordSet && (sameMainAnswer || sameChecksum)) {
    return {
      stale: true,
      comparedDate: prevDate,
      reason: sameMainAnswer
        ? "same answers and same main answer as yesterday"
        : "same answers and same checksum as yesterday",
    };
  }
  return { stale: false };
}

function createQuickOverview(puzzleNumber: number, words: string[]): string {
  return [
    `LinkedIn Pinpoint #${puzzleNumber} just unlocked, and this is the fastest verified update.`,
    `The board clues are ${words.join(", ")}, and the set looks broader than it really is at first.`,
    `This rapid post gives you a spoiler-safe starting point while the full clue-by-clue write-up is prepared.`,
    `A deeper clue-by-clue walkthrough will be added shortly.`,
  ].join(" ");
}

function createQuickSolution(puzzleNumber: number, words: string[]): string {
  return [
    `I tested each clue against the same connector and checked whether the phrase stayed natural.`,
    `For #${puzzleNumber}, ${words.join(", ")} only start to make sense once one shared reading locks the set together.`,
    `That shared fit across all five clues is why the final connector holds up cleanly.`,
    `I will expand this with richer clue context in the full version.`,
  ].join(" ");
}

function createQuickPayload(siteBaseUrl: string, puzzleDate: string, doc: Doc, puzzleNumber: number, words: string[]) {
  const answer = sanitizePublishedAnswerLabel(doc.mainAnswer || doc.theme || "Pinpoint connector") || "Pinpoint connector";
  const clueLabel = words.join(", ");
  const overview = createQuickOverview(puzzleNumber, words);
  const solution = createQuickSolution(puzzleNumber, words);
  const summary = `LinkedIn Pinpoint #${puzzleNumber}: ${clueLabel}.`;

  return {
    puzzleNumber,
    rawWords: words,
    analysis: {
      answerGroups: [{ category: answer, words }],
      detailedBreakdown: solution,
      dailyDebrief: `LinkedIn Pinpoint #${puzzleNumber} answer is ${answer}. Clues: ${clueLabel}.`,
      difficultyRating: 3,
      answerDescription: answer,
    },
    summary,
    mainAnswer: answer,
    sections: {
      overview,
      solutionEmergence: solution,
    },
    publishedAtIso: buildPublishedAtIso(puzzleDate, doc.fetchedAt),
    metadata: {
      publishedAtSource: `${siteBaseUrl}/api/publish`,
      publishedAtConfidence: 0.9,
    },
  };
}

function parseTargetLocales(raw: string | undefined): string[] {
  const normalized = String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const picked = normalized.length > 0 ? normalized : [...SUPPORTED_I18N_LOCALES];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of picked) {
    if (!I18N_LOCALE_SET.has(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function parseParallelCount(raw: string | undefined): number {
  const n = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(n) || n <= 0) return 2;
  return Math.min(3, Math.max(1, n));
}

function parseAttemptCount(raw: string | undefined, fallback: number, max = 3): number {
  const n = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(1, n));
}

function selectModel(raw: string | undefined, fallback: string): string {
  const model = String(raw || "").trim();
  return model.length > 0 ? model : fallback;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function countWords(value: string | undefined): number {
  if (!value) return 0;
  const matches = value.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toSectionRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null);
}

function getLocaleNarrativeLine(locale: string, words: string[], answer: string): string {
  const clueLine = words.join(", ");
  switch (locale) {
    case "fr":
      return `Cette analyse relie ${clueLine} a une meme idee, ${answer}, en montrant comment chaque indice confirme la solution finale.`;
    case "de":
      return `Diese Analyse verbindet ${clueLine} mit derselben Idee, ${answer}, und zeigt, wie jeder Hinweis die endgultige Losung belegt.`;
    case "pt-BR":
      return `Esta analise conecta ${clueLine} a mesma ideia, ${answer}, mostrando como cada pista confirma a solucao final.`;
    default:
      return `This analysis connects ${clueLine} through ${answer} and shows how each clue supports the final answer.`;
  }
}

function ensureMinimumWords(
  value: string | undefined,
  minWords: number,
  fallbackPieces: string[],
): string | undefined {
  let out = normalizeSpace(value || "");
  if (!out) {
    out = normalizeSpace(fallbackPieces.join(" "));
  }
  let index = 0;
  while (countWords(out) < minWords && index < fallbackPieces.length) {
    out = normalizeSpace(`${out} ${fallbackPieces[index]}`);
    index += 1;
  }
  while (countWords(out) < minWords && fallbackPieces.length > 0) {
    out = normalizeSpace(`${out} ${fallbackPieces[fallbackPieces.length - 1]}`);
  }
  return out || undefined;
}

function ensureMaxChars(value: string | undefined, maxChars: number): string | undefined {
  const input = normalizeSpace(value || "");
  if (!input) return undefined;
  if (input.length <= maxChars) return input;
  const softCut = input.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  if (softCut.length > 0) return softCut;
  const hardCut = input.slice(0, maxChars).trim();
  return hardCut.length > 0 ? hardCut : undefined;
}

function ensureMinWordsWithinMax(
  value: string | undefined,
  minWords: number,
  fallbackPieces: string[],
  maxChars: number,
): string | undefined {
  const nonEmptyFallback = fallbackPieces
    .map((piece) => normalizeSpace(piece))
    .filter((piece) => piece.length > 0);
  if (nonEmptyFallback.length === 0) {
    return ensureMaxChars(normalizeSpace(value || ""), maxChars);
  }

  let out = ensureMinimumWords(value, minWords, nonEmptyFallback);
  if (!out) out = nonEmptyFallback.join(" ");
  out = ensureMaxChars(out, maxChars) ?? out;
  if (!out) return undefined;
  if (countWords(out) >= minWords) return out;

  // If clipping dropped word count below threshold, retry using shorter fallbacks.
  const compactFallback = [...nonEmptyFallback].sort((a, b) => a.length - b.length);
  out = ensureMinimumWords(out, minWords, compactFallback) ?? out;
  out = ensureMaxChars(out, maxChars) ?? out;
  if (countWords(out) >= minWords) return out;

  out = ensureMinimumWords(compactFallback[0], minWords, compactFallback) ?? out;
  out = ensureMaxChars(out, maxChars) ?? out;
  return out;
}

type LocaleReadinessIssue = {
  code?: string;
  field?: string;
  message?: string;
};

function parseLocaleReadinessIssues(error: unknown): LocaleReadinessIssue[] {
  if (!(error instanceof SitePostError)) return [];
  if (error.status !== 422) return [];
  const body = String(error.responseBody || "");
  const jsonStart = body.indexOf("{");
  if (jsonStart < 0) return [];

  try {
    const parsed = asRecord(JSON.parse(body.slice(jsonStart)));
    if (!parsed || String(parsed.error || "") !== "LOCALE_CONTENT_INCOMPLETE") return [];
    const context = asRecord(parsed.context);
    const issuesRaw = Array.isArray(context?.issues) ? context.issues : [];
    const issues: LocaleReadinessIssue[] = [];
    for (const item of issuesRaw) {
      const row = asRecord(item);
      if (!row) continue;
      issues.push({
        code: typeof row.code === "string" ? row.code : undefined,
        field: typeof row.field === "string" ? row.field : undefined,
        message: typeof row.message === "string" ? row.message : undefined,
      });
    }
    return issues;
  } catch {
    return [];
  }
}

function ensureLocalizedClueDetails(
  locale: string,
  words: string[],
  localizedClueDetailsRaw: unknown,
  sourceClueDetailsRaw: unknown,
): Array<Record<string, string>> {
  const localizedRows = toSectionRows(localizedClueDetailsRaw);
  const sourceRows = toSectionRows(sourceClueDetailsRaw);
  const sourceByClue = new Map<string, Record<string, unknown>>();
  for (const row of sourceRows) {
    const clue = asNonEmptyString(row.clue);
    if (clue) sourceByClue.set(clue, row);
  }

  const localizedByClue = new Map<string, Record<string, unknown>>();
  for (const row of localizedRows) {
    const clue = asNonEmptyString(row.clue);
    if (clue) localizedByClue.set(clue, row);
  }

  return words.map((clue, index) => {
    const localized = localizedByClue.get(clue);
    const source = sourceByClue.get(clue);
    const phrase =
      asNonEmptyString(localized?.phrase) ??
      asNonEmptyString(source?.phrase) ??
      clue;
    const explanation =
      asNonEmptyString(localized?.explanation) ??
      asNonEmptyString(source?.explanation) ??
      getLocaleNarrativeLine(locale, [clue], clue);
    const safeExplanation = sameText(asNonEmptyString(source?.explanation), explanation)
      ? `${explanation} (${locale} recap #${index + 1})`
      : explanation;
    return {
      clue,
      phrase,
      explanation: safeExplanation,
    };
  });
}

function normalizedText(value: string | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function sameText(a: string | undefined, b: string | undefined): boolean {
  const na = normalizedText(a);
  const nb = normalizedText(b);
  return na.length > 0 && na === nb;
}

function buildEnrichedSections(
  draftSections: JsonRecord | null,
  fallbackSections: JsonRecord | null,
): JsonRecord {
  if (!draftSections) return fallbackSections ?? {};
  return {
    ...(typeof draftSections.overview === "string" ? { overview: draftSections.overview } : {}),
    ...(typeof draftSections.solutionEmergence === "string"
      ? { solutionEmergence: draftSections.solutionEmergence }
      : {}),
    ...(Array.isArray(draftSections.wrongGuesses) ? { wrongGuesses: draftSections.wrongGuesses } : {}),
    ...(Array.isArray(draftSections.clueDetails) ? { clueDetails: draftSections.clueDetails } : {}),
    ...(Array.isArray(draftSections.lessons) ? { lessons: draftSections.lessons } : {}),
    ...(Array.isArray(draftSections.faqs) ? { faqs: draftSections.faqs } : {}),
    ...(typeof draftSections.trivia === "string" ? { trivia: draftSections.trivia } : {}),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const safeLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runOne = async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  };

  const tasks = Array.from({ length: safeLimit }, () => runOne());
  await Promise.all(tasks);
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableI18nError(message: string): boolean {
  const normalized = message.toLowerCase();
  if (normalized.includes("timeout")) return true;
  if (normalized.includes("failed to parse json content")) return true;
  if (normalized.includes("returned non-json response")) return true;
  if (normalized.includes("localized draft missing required fields")) return true;
  if (/failed \((5\d{2}|429)\)/.test(normalized)) return true;
  return false;
}

class SitePostError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly responseBody?: string;
  readonly cause?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      retryable?: boolean;
      responseBody?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "SitePostError";
    this.status = options?.status;
    this.retryable = Boolean(options?.retryable);
    this.responseBody = options?.responseBody;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function isRetryableHttpStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

function isRetryableNetworkMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timeout") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("eai_again") ||
    normalized.includes("enotfound")
  );
}

function isRetryableSitePostError(error: unknown): boolean {
  if (error instanceof SitePostError) return error.retryable;
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    return isRetryableNetworkMessage(error.message);
  }
  return false;
}

function isDraftQualityGateError(error: unknown): boolean {
  if (!(error instanceof SitePostError)) return false;
  if (error.status !== 422) return false;
  const body = String(error.responseBody || error.message || "");
  return (
    body.includes("Draft generation failed contract") ||
    body.includes("Draft generation blocked") ||
    body.includes("First FAQ answer does not include the exact answer text") ||
    body.includes("Exactly 5 clue details are required") ||
    body.includes("Connection FAQ sounds generic")
  );
}

function extractDraftFailureSummary(error: unknown): string {
  const raw =
    error instanceof SitePostError
      ? String(error.responseBody || error.message || "")
      : error instanceof Error
        ? error.message
        : String(error || "unknown draft error");
  const match = raw.match(/Draft generation (?:failed contract|blocked):\s*([\s\S]+)/i);
  const summary = (match?.[1] || raw).replace(/\s+/g, " ").trim();
  return summary.length > 260 ? `${summary.slice(0, 257)}...` : summary;
}

function isQualityGateBlockedReason(reason: string | undefined): boolean {
  const normalized = String(reason || "").toLowerCase();
  return normalized.startsWith("quality gate blocked after");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForPublicPage(url: string): Promise<boolean> {
  const timeoutMs = 120_000;
  const intervalMs = 5_000;
  const requestTimeoutMs = 15_000;
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;

    try {
      const probeUrl = new URL(url);
      probeUrl.searchParams.set("__publish_probe", `${Date.now()}`);

      const res = await fetchWithTimeout(
        probeUrl.toString(),
        {
          method: "GET",
          headers: {
            "cache-control": "no-cache",
            pragma: "no-cache",
          },
          redirect: "follow",
        },
        requestTimeoutMs,
      );

      if (res.status === 200) {
        console.log(`[new-site] page ready after ${attempt} probe(s): ${url}`);
        return true;
      }

      console.log(`[new-site] page probe ${attempt} returned ${res.status}: ${url}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "unknown");
      console.warn(`[new-site] page probe ${attempt} failed: ${message}`);
    }

    await sleep(intervalMs);
  }

  console.warn(`[new-site] page did not become ready within ${timeoutMs}ms: ${url}`);
  return false;
}

async function postSiteJson(
  url: string,
  token: string,
  payload: unknown,
  timeoutMs: number,
): Promise<JsonRecord> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      timeoutMs,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SitePostError(`site POST ${url} failed (network): ${message}`, {
      retryable: true,
      cause: error,
    });
  }

  const text = await res.text();
  let json: JsonRecord | null = null;
  try {
    const parsed = JSON.parse(text);
    json = asRecord(parsed);
  } catch {
    json = null;
  }
  if (!res.ok) {
    const bodyText = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    throw new SitePostError(`site POST ${url} failed (${res.status}): ${bodyText}`, {
      status: res.status,
      retryable: isRetryableHttpStatus(res.status),
      responseBody: bodyText,
    });
  }
  if (!json) {
    throw new SitePostError(`site POST ${url} returned non-json response`, {
      status: res.status,
      retryable: false,
      responseBody: text.slice(0, 500),
    });
  }
  return json;
}

type SitePostRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  retryTag?: string;
};

async function postSiteJsonWithRetry(
  url: string,
  token: string,
  payload: unknown,
  timeoutMs: number,
  options?: SitePostRetryOptions,
): Promise<JsonRecord> {
  const maxAttempts = Math.max(1, Math.min(options?.maxAttempts ?? 2, 3));
  const baseDelayMs = Math.max(250, options?.baseDelayMs ?? 1000);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await postSiteJson(url, token, payload, timeoutMs);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableSitePostError(error);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), 5000);
      const reason = error instanceof Error ? error.message : String(error);
      console.warn("site POST retry scheduled", {
        retryTag: options?.retryTag || "site-post",
        url,
        attempt,
        maxAttempts,
        delayMs,
        reason,
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function quickPublishToSite(env: Env, puzzleDate: string, doc: Doc): Promise<QuickPublishResult> {
  const enabled = envFlag(env.AUTO_PUBLISH_ENABLED, true);
  if (!enabled) {
    return { status: "skipped", reason: "AUTO_PUBLISH_ENABLED=false" };
  }

  const siteBaseUrl = getLegacySiteBaseUrl(env);
  if (!siteBaseUrl) {
    return { status: "skipped", reason: "legacy site pipeline unavailable" };
  }

  const token = String(env.SITE_API_TOKEN || "").trim();
  if (!token) {
    return { status: "skipped", reason: "SITE_API_TOKEN missing" };
  }

  const quickDoneKey = quickPublishKeyOf(puzzleDate);
  const quickDone = await env.PP_DATA.get(quickDoneKey);
  if (quickDone) {
    return { status: "skipped", reason: "quick publish already done today" };
  }

  const words = extractWordsFromDoc(doc);
  const puzzleNumber = inferPuzzleNumber((doc as unknown as { puzzleNumber?: unknown }).puzzleNumber, puzzleDate);
  const payload = createQuickPayload(siteBaseUrl, puzzleDate, doc, puzzleNumber, words);

  const timeoutMs = parseTimeoutMs(env.AUTO_PUBLISH_TIMEOUT_MS, 15_000);
  const idempotencyKey = `worker:${puzzleDate}:quick:${doc.checksum.slice(0, 24)}`;
  await postSiteJsonWithRetry(
    `${siteBaseUrl}/api/publish`,
    token,
    { ...payload, idempotencyKey, locale: "en" },
    timeoutMs,
    { maxAttempts: 2, baseDelayMs: 1200, retryTag: "quick-publish" },
  );

  await env.PP_DATA.put(quickDoneKey, new Date().toISOString(), {
    expirationTtl: 60 * 60 * 24 * 14,
  });

  return { status: "published", puzzleNumber };
}

// ── New-site GitHub JSON publisher ──────────────────────────────────────────

type PublishedPuzzleDetailInput = {
  puzzleNumber: number;
  slug: string;
  puzzleDate: string;
  answer: string;
  words: string[];
  sections: JsonRecord;
  analysis: JsonRecord;
  slots?: JsonRecord | null;
  summary?: unknown;
  detailState?: PublishDetailState;
  questionType?: DetailQuestionType;
  difficultyBand?: DetailDifficultyBand;
  solvePath?: WorkerSolvePathRecord | null;
  turningPoint?: WorkerTurningPointRecord | null;
  clueRows?: WorkerClueRow[];
  faqItems?: WorkerFaqItem[];
  uniquenessSignals?: WorkerUniquenessSignals | null;
};

const MIN_DETAIL_FULL_ANALYSIS_WORDS = 80;
const MIN_DETAIL_SHORT_ANALYSIS_WORDS = 60;

type PublishedPuzzleDetailSnapshot = {
  slug: string;
  detailState: PublishDetailState;
  bodyMode: "full" | "short";
  fullAnalysisWordCount: number;
  minRequiredWords: number;
};

type ThinContentProtectionDecision =
  | { action: "use-incoming" }
  | { action: "keep-existing"; reason: string }
  | { action: "use-primary"; content: string; reason: string };

function countDetailWords(paragraphs: string[]): number {
  return paragraphs
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function summarizePublishedPuzzleDetail(value: unknown): PublishedPuzzleDetailSnapshot | null {
  const record = asRecord(value);
  if (!record) return null;

  const slug = String(record.slug || "").trim();
  if (!slug) return null;

  const bodyMode = String(record.bodyMode || "").trim().toLowerCase() === "short" ? "short" : "full";
  const fullAnalysis = Array.isArray(record.fullAnalysis)
    ? record.fullAnalysis
      .map((paragraph) => String(paragraph || "").trim())
      .filter(Boolean)
    : [];
  const minRequiredWords =
    bodyMode === "short" ? MIN_DETAIL_SHORT_ANALYSIS_WORDS : MIN_DETAIL_FULL_ANALYSIS_WORDS;

  return {
    slug,
    detailState: resolvePublishDetailState(record.detailState),
    bodyMode,
    fullAnalysisWordCount: countDetailWords(fullAnalysis),
    minRequiredWords,
  };
}

function summarizePublishedPuzzleDetailContent(content: string): PublishedPuzzleDetailSnapshot | null {
  try {
    return summarizePublishedPuzzleDetail(JSON.parse(content));
  } catch {
    return null;
  }
}

function isDetailSnapshotAtOrAboveFloor(snapshot: PublishedPuzzleDetailSnapshot | null): boolean {
  if (!snapshot) return false;
  return snapshot.fullAnalysisWordCount >= snapshot.minRequiredWords;
}

function describeDetailSnapshot(snapshot: PublishedPuzzleDetailSnapshot): string {
  return `${snapshot.detailState} ${snapshot.fullAnalysisWordCount}/${snapshot.minRequiredWords} words`;
}

function resolveThinContentProtectionDecision({
  incoming,
  existingBranch,
  primaryBranch,
  isPublicState,
}: {
  incoming: PublishedPuzzleDetailSnapshot | null;
  existingBranch: { summary: PublishedPuzzleDetailSnapshot | null };
  primaryBranch?: { summary: PublishedPuzzleDetailSnapshot | null; content: string };
  isPublicState: boolean;
}): ThinContentProtectionDecision {
  if (!incoming || isDetailSnapshotAtOrAboveFloor(incoming)) {
    return { action: "use-incoming" };
  }

  if (
    isDetailSnapshotAtOrAboveFloor(existingBranch.summary) &&
    existingBranch.summary?.slug === incoming.slug
  ) {
    return {
      action: "keep-existing",
      reason:
        `incoming ${describeDetailSnapshot(incoming)} would regress below the content floor; ` +
        `keeping current branch detail ${describeDetailSnapshot(existingBranch.summary)}`,
    };
  }

  if (
    isPublicState &&
    primaryBranch?.content &&
    isDetailSnapshotAtOrAboveFloor(primaryBranch.summary) &&
    primaryBranch.summary?.slug === incoming.slug
  ) {
    return {
      action: "use-primary",
      content: primaryBranch.content,
      reason:
        `incoming ${describeDetailSnapshot(incoming)} would regress below the content floor; ` +
        `reusing primary-branch detail ${describeDetailSnapshot(primaryBranch.summary)}`,
    };
  }

  return { action: "use-incoming" };
}

function normalizeWorkerLooseText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/["“”'’()\-_,!?:.;/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferWorkerDetailQuestionType(answer: string): DetailQuestionType {
  const pattern = detectWorkerAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return "phrase";
  }
  if (pattern.kind === "association") {
    return "association";
  }
  return "category";
}

type ProvidedEvidenceFields = {
  questionType?: DetailQuestionType;
  difficultyBand?: DetailDifficultyBand;
  solvePath?: WorkerSolvePathRecord | null;
  turningPoint?: WorkerTurningPointRecord | null;
  clueRows?: WorkerClueRow[];
  faqItems?: WorkerFaqItem[];
  uniquenessSignals?: WorkerUniquenessSignals | null;
};

function resolveProvidedWorkerQuestionType(value: unknown): DetailQuestionType | undefined {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "phrase" ||
    normalized === "category" ||
    normalized === "association" ||
    normalized === "hybrid"
  ) {
    return normalized;
  }
  return undefined;
}

function resolveProvidedWorkerDifficultyBand(value: unknown): DetailDifficultyBand | undefined {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "obvious" || normalized === "medium" || normalized === "hard") {
    return normalized;
  }
  return undefined;
}

function normalizeWorkerRecordArray(value: unknown): JsonRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .map((item) => asRecord(item))
    .filter((item): item is JsonRecord => Boolean(item));
  return rows.length > 0 ? rows : undefined;
}

function normalizeWorkerTurningPointRecord(value: unknown): WorkerTurningPointRecord | null {
  const record = asRecord(value);
  const clue = asNonEmptyString(record?.clue);
  const whyDecisive = asNonEmptyString(record?.whyDecisive);
  const whatChangedAfterIt = asNonEmptyString(record?.whatChangedAfterIt);
  if (!clue || !whyDecisive || !whatChangedAfterIt) return null;
  return { clue, whyDecisive, whatChangedAfterIt };
}

function normalizeWorkerSolvePathRecord(value: unknown): WorkerSolvePathRecord | null {
  const record = asRecord(value);
  const firstRead = asNonEmptyString(record?.firstRead);
  if (!firstRead) return null;
  const falseStarts = Array.isArray(record?.falseStarts)
    ? record.falseStarts.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const whyFalseStartPlausible = Array.isArray(record?.whyFalseStartPlausible)
    ? record.whyFalseStartPlausible.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const breakingClue = asNonEmptyString(record?.breakingClue) || undefined;
  const pivot = asNonEmptyString(record?.pivot) || undefined;
  const fullBoardConfirmation = asNonEmptyString(record?.fullBoardConfirmation) || undefined;
  return {
    firstRead,
    falseStarts,
    whyFalseStartPlausible,
    ...(breakingClue ? { breakingClue } : {}),
    ...(pivot ? { pivot } : {}),
    ...(fullBoardConfirmation ? { fullBoardConfirmation } : {}),
  };
}

function normalizeWorkerClueRows(value: unknown): WorkerClueRow[] | undefined {
  const rows = normalizeWorkerRecordArray(value);
  if (!rows) return undefined;
  const normalized = rows
    .map((row) => {
      const clue = asNonEmptyString(row.clue);
      const surfaceMisread = asNonEmptyString(row.surfaceMisread);
      const resolvedPhraseOrMember = asNonEmptyString(row.resolvedPhraseOrMember);
      const nonObviousWhy = asNonEmptyString(row.nonObviousWhy);
      const searchableContext = asNonEmptyString(row.searchableContext);
      if (!clue || !surfaceMisread || !resolvedPhraseOrMember || !nonObviousWhy || !searchableContext) {
        return null;
      }
      return {
        clue,
        surfaceMisread,
        resolvedPhraseOrMember,
        nonObviousWhy,
        searchableContext,
      };
    })
    .filter((row): row is WorkerClueRow => Boolean(row));
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeWorkerFaqItems(value: unknown): WorkerFaqItem[] | undefined {
  const rows = normalizeWorkerRecordArray(value);
  if (!rows) return undefined;
  const normalized = rows
    .map((row) => {
      const question = asNonEmptyString(row.question);
      const answer = asNonEmptyString(row.answer);
      const intentType = String(row.intentType || "").trim() as WorkerFaqItem["intentType"];
      const tiedClue = asNonEmptyString(row.tiedClue) || null;
      if (!question || !answer) return null;
      if (
        intentType !== "definition" &&
        intentType !== "clue_background" &&
        intentType !== "comparison" &&
        intentType !== "solve_strategy" &&
        intentType !== "category_context"
      ) {
        return null;
      }
      return { intentType, question, answer, tiedClue };
    })
    .filter((row): row is WorkerFaqItem => Boolean(row));
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeWorkerUniquenessSignals(value: unknown): WorkerUniquenessSignals | null {
  const record = asRecord(value);
  const angle = asNonEmptyString(record?.angle);
  const relatedEntities = Array.isArray(record?.relatedEntities)
    ? record.relatedEntities.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const doNotRepeatPatterns = Array.isArray(record?.doNotRepeatPatterns)
    ? record.doNotRepeatPatterns.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!angle || relatedEntities.length === 0 || doNotRepeatPatterns.length === 0) return null;
  return { angle, relatedEntities, doNotRepeatPatterns };
}

function extractProvidedEvidenceFields(payload: JsonRecord): ProvidedEvidenceFields {
  return {
    questionType: resolveProvidedWorkerQuestionType(payload.questionType),
    difficultyBand: resolveProvidedWorkerDifficultyBand(payload.difficultyBand),
    solvePath: normalizeWorkerSolvePathRecord(payload.solvePath),
    turningPoint: normalizeWorkerTurningPointRecord(payload.turningPoint),
    clueRows: normalizeWorkerClueRows(payload.clueRows),
    faqItems: normalizeWorkerFaqItems(payload.faqItems),
    uniquenessSignals: normalizeWorkerUniquenessSignals(payload.uniquenessSignals),
  };
}

function inferWorkerDifficultyBand(answer: string, sections: JsonRecord): DetailDifficultyBand {
  const wrongGuesses = Array.isArray(sections.wrongGuesses) ? sections.wrongGuesses : [];
  if (wrongGuesses.length >= 2) return "hard";
  if (wrongGuesses.length === 0 && inferWorkerDetailQuestionType(answer) !== "association") {
    return "obvious";
  }
  return "medium";
}

function findWorkerMentionedClue(text: string, words: string[]): string | null {
  const normalizedText = normalizeWorkerLooseText(text);
  for (const word of words) {
    const normalizedWord = normalizeWorkerLooseText(word);
    if (normalizedWord && normalizedText.includes(normalizedWord)) {
      return word;
    }
  }
  return null;
}

function inferWorkerTurningPointRecord(
  words: string[],
  sections: JsonRecord,
  analysis: JsonRecord,
  clueDetails: Array<Record<string, unknown>>,
): WorkerTurningPointRecord | null {
  const candidateTexts = [
    asNonEmptyString(sections.solutionEmergence),
    asNonEmptyString(sections.overview),
    asNonEmptyString(analysis.detailedBreakdown),
  ].filter(Boolean) as string[];
  const keywordPattern = /(turn|turning|key clue|strongest clue|giveaway|locks the answer|makes .* concrete|impossible to miss)/i;

  let bestClue = words[0] || "";
  let bestScore = -1;

  for (const clue of words) {
    let score = 0;
    for (const text of candidateTexts) {
      if (!normalizeWorkerLooseText(text).includes(normalizeWorkerLooseText(clue))) continue;
      score += 2;
      if (keywordPattern.test(text)) score += 5;
    }
    const detail = clueDetails.find((item) => asNonEmptyString(item.clue) === clue);
    const explanation = asNonEmptyString(detail?.explanation) || "";
    if (keywordPattern.test(explanation)) score += 4;
    if (score > bestScore) {
      bestScore = score;
      bestClue = clue;
    }
  }

  if (!bestClue) return null;
  const detail = clueDetails.find((item) => asNonEmptyString(item.clue) === bestClue);
  const whyDecisive =
    asNonEmptyString(detail?.explanation) ||
    `${bestClue} is the clue that makes the answer precise enough to test across the full board.`;

  return {
    clue: bestClue,
    whyDecisive,
    whatChangedAfterIt: `Once ${bestClue} lands, the earlier clues stop feeling broad and start reading under the same answer.`,
  };
}

function inferWorkerSolvePath(
  sections: JsonRecord,
  analysis: JsonRecord,
  slots: JsonRecord | null,
  turningPoint: WorkerTurningPointRecord | null,
): WorkerSolvePathRecord {
  const firstRead =
    toParagraphs(sections.overview, asNonEmptyString(analysis.detailedBreakdown) || "")[0] ||
    "The opening clues support more than one plausible read before a later clue tightens the board.";
  const wrongGuesses = Array.isArray(sections.wrongGuesses)
    ? sections.wrongGuesses
        .map((item) => asRecord(item))
        .filter((item): item is JsonRecord => Boolean(item))
    : [];
  const falseStarts = wrongGuesses
    .map((item) => asNonEmptyString(item.guess))
    .filter((item): item is string => Boolean(item))
    .slice(0, 2);
  const whyFalseStartPlausible = wrongGuesses
    .map((item) => asNonEmptyString(item.explanation))
    .filter((item): item is string => Boolean(item))
    .slice(0, Math.max(falseStarts.length, 1));
  const pivot =
    asNonEmptyString(sections.solutionEmergence) ||
    asNonEmptyString(slots?.turningPoint) ||
    turningPoint?.whyDecisive;
  const fullBoardConfirmation =
    toParagraphs(
      analysis.detailedBreakdown,
      turningPoint?.whatChangedAfterIt || "Once the turning clue lands, the rest of the board starts confirming the same answer.",
    ).find((paragraph, index) => index > 0 && /the answer (?:is|was)|once /i.test(paragraph)) ||
    turningPoint?.whatChangedAfterIt;

  return {
    firstRead,
    falseStarts,
    whyFalseStartPlausible,
    ...(turningPoint?.clue ? { breakingClue: turningPoint.clue } : {}),
    ...(pivot ? { pivot } : {}),
    ...(fullBoardConfirmation ? { fullBoardConfirmation } : {}),
  };
}

function inferWorkerClueRows(
  words: string[],
  clueDetails: Array<Record<string, unknown>>,
  wrongGuessLabel: string,
) {
  return words.map((word, index) => {
    const detail = clueDetails[index] ?? {};
    return {
      clue: word,
      surfaceMisread: wrongGuessLabel,
      resolvedPhraseOrMember: asNonEmptyString(detail.phrase) || word,
      nonObviousWhy:
        asNonEmptyString(detail.explanation) ||
        `${word} supports the same answer once the shared frame becomes clear.`,
      searchableContext: asNonEmptyString(detail.etymology) || asNonEmptyString(detail.phrase) || word,
    };
  });
}

function inferWorkerFaqIntentType(question: string): "definition" | "clue_background" | "comparison" | "solve_strategy" | "category_context" {
  const normalized = normalizeWorkerLooseText(question);
  if (normalized.includes("what is the answer")) return "definition";
  if (normalized.includes("what is the connection")) return "category_context";
  if (normalized.includes("which clue") || normalized.startsWith("why is")) return "clue_background";
  if (normalized.includes("compare") || normalized.includes("difference")) return "comparison";
  return "solve_strategy";
}

function inferWorkerFaqItems(
  faqs: Array<{ question: string; answer: string }>,
  words: string[],
) {
  return faqs.map((faq) => ({
    intentType: inferWorkerFaqIntentType(faq.question),
    question: faq.question,
    answer: faq.answer,
    tiedClue: findWorkerMentionedClue(`${faq.question} ${faq.answer}`, words),
  }));
}

function buildWorkerUniquenessSignals(
  answer: string,
  clueRows: WorkerClueRow[],
): WorkerUniquenessSignals {
  const angle = buildWorkerConnectorSummary(answer);
  const relatedEntities = clueRows.map((row) => row.resolvedPhraseOrMember).filter(Boolean).slice(0, 5);
  const doNotRepeatPatterns = Array.from(
    new Set([angle, ...clueRows.map((row) => row.searchableContext || row.resolvedPhraseOrMember)].filter(Boolean)),
  ).slice(0, 5);
  return {
    angle,
    relatedEntities,
    doNotRepeatPatterns,
  };
}

export function buildPublishedPuzzleDetailRecord({
  puzzleNumber,
  slug,
  puzzleDate,
  answer,
  words,
  sections,
  analysis,
  slots = null,
  summary,
  detailState = "published",
  questionType: providedQuestionType,
  difficultyBand: providedDifficultyBand,
  solvePath: providedSolvePath = null,
  turningPoint: providedTurningPoint = null,
  clueRows: providedClueRows,
  faqItems: providedFaqItems,
  uniquenessSignals: providedUniquenessSignals = null,
}: PublishedPuzzleDetailInput) {
  const clueDetails = Array.isArray(sections.clueDetails) ? sections.clueDetails : [];

  const wordHints: Record<string, string> = {};
  words.forEach((word, index) => {
    const detail = clueDetails[index] as Record<string, unknown> | undefined;
    const hint = typeof detail?.explanation === "string"
      ? detail.explanation
      : `${word} connects to "${answer}"`;
    wordHints[word] = hint;
  });

  const lessons = Array.isArray(sections.lessons) ? sections.lessons : [
    { title: "Look for word patterns", body: "Many Pinpoint puzzles use words that share a prefix, suffix, or compound with the answer." },
    { title: "Test each clue", body: "Verify the connection holds for all 5 clues before committing." },
    { title: "Trust your instinct", body: "If a theme fits most clues naturally, it is usually correct." },
  ];
  const faqs = Array.isArray(sections.faqs) ? sections.faqs : [
    { question: `What is the answer to LinkedIn Pinpoint #${puzzleNumber}?`, answer: `The answer is "${answer}". The clues ${words.join(", ")} all share this connection.` },
    { question: "How difficult was this Pinpoint puzzle?", answer: "Difficulty varies, but identifying the shared word pattern across all five clues is the key strategy." },
    { question: "What strategy helps with Pinpoint?", answer: "Look for compound words, prefix/suffix patterns, or phrases that link all five clues to one word or concept." },
  ];

  const rawAnalysisText = String(analysis.detailedBreakdown || sections.overview || "").trim();
  const rawAnalysisWordCount = rawAnalysisText ? rawAnalysisText.split(/\s+/).filter(Boolean).length : 0;
  const analysisSource = rawAnalysisWordCount >= 80
    ? rawAnalysisText
    : buildFallbackAnalysis(puzzleNumber, words, answer, clueDetails as Array<Record<string, unknown>>);
  const articleBlocks = toParagraphs(
    (sections as Record<string, unknown>).articleBlocks,
    analysisSource,
  );
  const fullAnalysis = articleBlocks;
  const solutionNarrative = toParagraphs(
    sections.solutionEmergence,
    `I started by testing each clue against possible themes. The words ${words.join(", ")} only began to make sense once one shared connector explained the full set.`,
  );
  const spoilerHints = buildWorkerSpoilerHints(words, answer);
  const display = buildWorkerDisplay(words, answer, wordHints, lessons, clueDetails as Array<Record<string, unknown>>);
  const wrongGuessLabel =
    Array.isArray(sections.wrongGuesses) && sections.wrongGuesses.length > 0
      ? asNonEmptyString(asRecord(sections.wrongGuesses[0])?.guess) || "an early broad guess"
      : "an early broad guess";
  const questionType = providedQuestionType ?? inferWorkerDetailQuestionType(answer);
  const difficultyBand = providedDifficultyBand ?? inferWorkerDifficultyBand(answer, sections);
  const turningPoint =
    providedTurningPoint ??
    inferWorkerTurningPointRecord(words, sections, analysis, clueDetails as Array<Record<string, unknown>>);
  const solvePath = providedSolvePath ?? inferWorkerSolvePath(sections, analysis, slots, turningPoint);
  const clueRows =
    (Array.isArray(providedClueRows) && providedClueRows.length > 0
      ? providedClueRows
      : inferWorkerClueRows(words, clueDetails as Array<Record<string, unknown>>, wrongGuessLabel));
  const faqItems =
    (Array.isArray(providedFaqItems) && providedFaqItems.length > 0
      ? providedFaqItems
      : inferWorkerFaqItems(faqs, words));
  const uniquenessSignals = providedUniquenessSignals ?? buildWorkerUniquenessSignals(answer, clueRows);

  return {
    puzzleNumber,
    slug,
    publishDate: puzzleDate,
    isoDate: puzzleDate,
    detailState,
    questionType,
    difficultyBand,
    clues: words,
    answer,
    category: answer,
    wordHints,
    spoilerHints,
    articleBlocks,
    fullAnalysis,
    solutionNarrative,
    lessons,
    display,
    faqs,
    solvePath,
    turningPoint: turningPoint ?? undefined,
    clueRows,
    faqItems,
    uniquenessSignals,
  };
}

function resolvePublishDetailState(value: unknown): PublishDetailState {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "generating" ||
    normalized === "validated" ||
    normalized === "failed" ||
    normalized === "fallback_full"
  ) {
    return normalized;
  }
  return "published";
}

function isPublicPublishDetailState(detailState: PublishDetailState): detailState is PublicDetailState {
  return detailState === "published" || detailState === "fallback_full";
}

function isPrimaryNewSiteBranch(branch: string): boolean {
  return branch.trim() === "main";
}

function buildNewSiteStatusPayload(
  siteBaseUrl: string,
  puzzleDate: string,
  doc: Doc,
  puzzleNumber: number,
  words: string[],
  detailState: PublishDetailState,
): JsonRecord {
  return {
    ...createQuickPayload(siteBaseUrl, puzzleDate, doc, puzzleNumber, words),
    detailState,
  };
}

function isSuccessfulEnrichResult(
  result: EnrichPublishResult,
): result is EnrichPublishResult & {
  status: "enriched" | "fallback_full";
  payload: JsonRecord;
  detailState: PublicDetailState;
} {
  return (
    (result.status === "enriched" || result.status === "fallback_full") &&
    Boolean(result.payload) &&
    Boolean(result.detailState)
  );
}

async function publishToNewSiteGitHub(
  env: Env,
  puzzleDate: string,
  doc: Doc,
  enrichedPayload: JsonRecord,
  puzzleNumber: number,
): Promise<void> {
  const token = String(env.GITHUB_TOKEN_NEW_SITE || "").trim();
  if (!token) return;

  const repo = String(env.GITHUB_REPO_NEW_SITE || "elng12/pinpoint-answer-today-new").trim();
  const branch = String(env.GITHUB_BRANCH_NEW_SITE || "main").trim();
  const newSiteUrl = String(env.NEW_SITE_URL || "").trim();
  const revalidateSecret = String(env.NEW_SITE_REVALIDATE_SECRET || "").trim();
  const isPrimaryBranch = isPrimaryNewSiteBranch(branch);
  const slug = `pinpoint-answer-${puzzleNumber}`;
  const encodedBranchRef = branch.split("/").map((segment) => encodeURIComponent(segment)).join("/");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "pinpoint-worker/1.0",
  };
  const decodeGitHubFileContent = (content: string): string =>
    new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\n/g, "")), (char) => char.charCodeAt(0)));
  const sameStringArray = (existing: unknown, next: string[]): boolean =>
    Array.isArray(existing) &&
    existing.length === next.length &&
    existing.every((item, index) => String(item ?? "").trim() === next[index]);

  const getFile = async (path: string, ref = branch): Promise<{ content: string; sha: string } | null> => {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status}`);
    return res.json() as Promise<{ content: string; sha: string }>;
  };

  const getJson = async (url: string, errorPrefix: string): Promise<JsonRecord> => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${errorPrefix}: ${res.status} ${await res.text()}`);
    return (asRecord(await res.json()) ?? {}) as JsonRecord;
  };

  const postJson = async (url: string, body: Record<string, unknown>, errorPrefix: string): Promise<JsonRecord> => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${errorPrefix}: ${res.status} ${await res.text()}`);
    return (asRecord(await res.json()) ?? {}) as JsonRecord;
  };

  const patchJson = async (url: string, body: Record<string, unknown>, errorPrefix: string): Promise<void> => {
    const res = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${errorPrefix}: ${res.status} ${await res.text()}`);
  };

  const stagedFiles: Array<{ path: string; content: string }> = [];
  const stageFile = (
    path: string,
    content: string,
    existingFile?: { content: string; sha: string } | null,
  ): boolean => {
    if (existingFile && decodeGitHubFileContent(existingFile.content) === content) {
      console.log(`[new-site] skip unchanged ${path}`);
      return false;
    }
    stagedFiles.push({ path, content });
    return true;
  };

  const commitStagedFiles = async (message: string): Promise<void> => {
    const refJson = await getJson(
      `https://api.github.com/repos/${repo}/git/ref/heads/${encodedBranchRef}`,
      `GitHub GET ref ${branch}`,
    );
    const currentCommitSha = String(asRecord(refJson.object)?.sha || "").trim();
    if (!currentCommitSha) {
      throw new Error(`GitHub ref ${branch} missing commit sha`);
    }

    const commitJson = await getJson(
      `https://api.github.com/repos/${repo}/git/commits/${currentCommitSha}`,
      `GitHub GET commit ${currentCommitSha}`,
    );
    const baseTreeSha = String(asRecord(commitJson.tree)?.sha || "").trim();
    if (!baseTreeSha) {
      throw new Error(`GitHub commit ${currentCommitSha} missing tree sha`);
    }

    const treeJson = await postJson(
      `https://api.github.com/repos/${repo}/git/trees`,
      {
        base_tree: baseTreeSha,
        tree: stagedFiles.map((entry) => ({
          path: entry.path,
          mode: "100644",
          type: "blob",
          content: entry.content,
        })),
      },
      "GitHub POST tree",
    );
    const nextTreeSha = String(treeJson.sha || "").trim();
    if (!nextTreeSha) {
      throw new Error("GitHub tree response missing sha");
    }

    const newCommitJson = await postJson(
      `https://api.github.com/repos/${repo}/git/commits`,
      {
        message,
        tree: nextTreeSha,
        parents: [currentCommitSha],
      },
      "GitHub POST commit",
    );
    const newCommitSha = String(newCommitJson.sha || "").trim();
    if (!newCommitSha) {
      throw new Error("GitHub commit response missing sha");
    }

    await patchJson(
      `https://api.github.com/repos/${repo}/git/refs/heads/${encodedBranchRef}`,
      { sha: newCommitSha, force: false },
      `GitHub PATCH ref ${branch}`,
    );
  };

  // Extract data from enrichedPayload
  const words = Array.isArray(enrichedPayload.rawWords)
    ? (enrichedPayload.rawWords as string[])
    : extractWordsFromDoc(doc);
  const answer = sanitizePublishedAnswerLabel(enrichedPayload.mainAnswer || doc.mainAnswer || doc.theme || "");
  const detailState = resolvePublishDetailState(enrichedPayload.detailState);
  const isPublicState = isPublicPublishDetailState(detailState);
  const sections = asRecord(enrichedPayload.sections) ?? {};
  const analysis = asRecord(enrichedPayload.analysis) ?? {};
  const slots = asRecord(enrichedPayload.slots);
  const providedEvidence = extractProvidedEvidenceFields(enrichedPayload);
  const detailRecord = buildPublishedPuzzleDetailRecord({
    puzzleNumber,
    slug,
    puzzleDate,
    answer,
    words,
    sections,
    analysis,
    slots,
    summary: enrichedPayload.summary,
    detailState,
    ...providedEvidence,
  });
  const shortSummary = String(
    enrichedPayload.summary ||
      `Pinpoint #${puzzleNumber}: ${words.join(", ")}. Spoiler-safe hints and the full walkthrough are inside.`,
  );

  // ── 1. Write {slug}.json ──
  const slugPath = `data/puzzles/${slug}.json`;
  const slugJson = JSON.stringify(detailRecord, null, 2);
  const existingSlug = await getFile(slugPath);
  const existingSlugContent = existingSlug ? decodeGitHubFileContent(existingSlug.content) : "";
  const existingSlugSummary = existingSlugContent
    ? summarizePublishedPuzzleDetailContent(existingSlugContent)
    : null;
  const primarySlug = !isPrimaryBranch ? await getFile(slugPath, "main") : null;
  const primarySlugContent = primarySlug ? decodeGitHubFileContent(primarySlug.content) : "";
  const primarySlugSummary = primarySlugContent
    ? summarizePublishedPuzzleDetailContent(primarySlugContent)
    : null;
  const slugProtection = resolveThinContentProtectionDecision({
    incoming: summarizePublishedPuzzleDetail(detailRecord),
    existingBranch: { summary: existingSlugSummary },
    primaryBranch: primarySlugContent
      ? { summary: primarySlugSummary, content: primarySlugContent }
      : undefined,
    isPublicState,
  });

  let slugChanged = false;
  if (slugProtection.action === "keep-existing") {
    console.warn(`[new-site] skip regressive detail overwrite for ${slugPath}: ${slugProtection.reason}`);
  } else {
    if (slugProtection.action === "use-primary") {
      console.warn(`[new-site] heal ${slugPath} from primary branch: ${slugProtection.reason}`);
    }
    slugChanged = stageFile(
      slugPath,
      slugProtection.action === "use-primary" ? slugProtection.content : slugJson,
      existingSlug,
    );
  }

  // ── 2. Update registry.json ──
  const registryFile = await getFile("data/puzzles/registry.json");
  let registryChanged = false;
  if (!registryFile) {
    console.warn("[new-site] registry.json not found, skipping registry update");
  } else {
    const registryRaw = decodeGitHubFileContent(registryFile.content);
    const registry = JSON.parse(registryRaw) as Array<Record<string, unknown>>;
    const updatedAt = new Date().toISOString();
    const nextRegistry = registry.map((entry) => ({ ...entry }));
    const existingIndex = registry.findIndex((e) => e.puzzleNumber === puzzleNumber);

    if (existingIndex === -1) {
      for (const entry of nextRegistry) {
        if (entry.status === "live") {
          entry.status = "archived";
          entry.updatedAt = updatedAt;
        }
      }
      nextRegistry.unshift({
        puzzleNumber,
        slug,
        publishDate: puzzleDate,
        status: "live",
        detailState,
        clues: words,
        mainAnswer: answer,
        category: answer,
        difficultyLevel: "Moderate",
        shortSummary,
        updatedAt,
      });
    } else {
      for (let index = 0; index < nextRegistry.length; index += 1) {
        const entry = nextRegistry[index];
        if (index !== existingIndex && entry.status === "live") {
          entry.status = "archived";
          entry.updatedAt = updatedAt;
        }
      }

      const existingEntry = nextRegistry[existingIndex];
      const needsEntryUpdate =
        existingEntry.status !== "live" ||
        resolvePublishDetailState(existingEntry.detailState) !== detailState ||
        String(existingEntry.slug ?? "") !== slug ||
        String(existingEntry.publishDate ?? "") !== puzzleDate ||
        !sameStringArray(existingEntry.clues, words) ||
        String(existingEntry.mainAnswer ?? "") !== answer ||
        String(existingEntry.category ?? "") !== answer ||
        String(existingEntry.difficultyLevel ?? "Moderate") !== "Moderate" ||
        String(existingEntry.shortSummary ?? "") !== shortSummary;

      if (needsEntryUpdate) {
        existingEntry.puzzleNumber = puzzleNumber;
        existingEntry.slug = slug;
        existingEntry.publishDate = puzzleDate;
        existingEntry.status = "live";
        existingEntry.detailState = detailState;
        existingEntry.clues = words;
        existingEntry.mainAnswer = answer;
        existingEntry.category = answer;
        existingEntry.difficultyLevel = "Moderate";
        existingEntry.shortSummary = shortSummary;
        existingEntry.updatedAt = updatedAt;
      }
    }

    registryChanged = stageFile(
      "data/puzzles/registry.json",
      JSON.stringify(nextRegistry, null, 2),
      registryFile,
    );
  }

  const hasContentChanges = slugChanged || registryChanged;
  if (!hasContentChanges) {
    console.log(`[new-site] GitHub publish skipped for #${puzzleNumber} (${detailState}, no content changes)`);
    return;
  }

  const commitMessage = isPublicState
    ? `feat: publish Pinpoint #${puzzleNumber}`
    : `chore: update Pinpoint #${puzzleNumber} state to ${detailState}`;
  await commitStagedFiles(commitMessage);
  console.log(`[new-site] committed ${stagedFiles.length} file(s) for #${puzzleNumber} (${detailState})`);

  // ── 3. Trigger ISR revalidation on the new site ──
  if (isPublicState && isPrimaryBranch && newSiteUrl && revalidateSecret) {
    const revalidateUrl = `${newSiteUrl}/api/revalidate?slug=${encodeURIComponent(slug)}`;
    const revalRes = await fetch(revalidateUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${revalidateSecret}`,
        "x-revalidate-secret": revalidateSecret,
      },
    });
    console.log(`[new-site] ISR revalidate: ${revalRes.status}`);
  }

  const pageUrl = isPrimaryBranch && newSiteUrl ? `${newSiteUrl}/linkedin-pinpoint-answers/${slug}/` : "";
  const pageReady = isPublicState && pageUrl ? await waitForPublicPage(pageUrl) : false;

  // ── 4. 飞书通知（每天只发一次，用 KV 去重）──
  const feishuWebhook = String(env.FEISHU_WEBHOOK_URL || "").trim();
  const publishNotifyKey = `notify:publish:${puzzleDate}:${puzzleNumber}`;
  const alreadyPublishNotified = feishuWebhook
    ? await env.PP_DATA.get(publishNotifyKey).then((v) => v !== null).catch(() => false)
    : true;
  if (!alreadyPublishNotified) {
    await env.PP_DATA.put(publishNotifyKey, "1", { expirationTtl: 172800 }).catch(() => undefined);
  }
  if (isPublicState && isPrimaryBranch && feishuWebhook && !alreadyPublishNotified) {
    const beijingToday = getBeijingTodayDate();
    const isTodayPublish = puzzleDate === beijingToday;
    const clueStr = words.map((w, i) => `${i + 1}. ${w}`).join("\n");
    const publishFields = isTodayPublish
      ? [
        { is_short: true, text: { tag: "lark_md", content: `**谜题编号**\n#${puzzleNumber}` } },
        { is_short: true, text: { tag: "lark_md", content: `**答案**\n${answer}` } },
        { is_short: true, text: { tag: "lark_md", content: `**发布日期**\n${puzzleDate}` } },
        { is_short: true, text: { tag: "lark_md", content: `**难度**\nModerate` } },
      ]
      : [
        { is_short: true, text: { tag: "lark_md", content: `**谜题编号**\n#${puzzleNumber}` } },
        { is_short: true, text: { tag: "lark_md", content: `**答案**\n${answer}` } },
        { is_short: true, text: { tag: "lark_md", content: `**原始发布日期**\n${puzzleDate}` } },
        { is_short: true, text: { tag: "lark_md", content: `**补发日期（北京时间）**\n${beijingToday}` } },
      ];
    const msg = {
      msg_type: "interactive",
      card: {
        header: {
          title: {
            tag: "plain_text",
            content: isTodayPublish
              ? `✅ 新站今日谜题 #${puzzleNumber} 已发布`
              : `🕒 新站历史谜题 #${puzzleNumber} 已补发`,
          },
          template: isTodayPublish ? "green" : "grey",
        },
        elements: [
          ...(!isTodayPublish ? [{
            tag: "div",
            text: {
              tag: "lark_md",
              content: "这不是今天新题，而是历史谜题补发，避免和今日抓取结果混淆。",
            },
          }] : []),
          {
            tag: "div",
            fields: publishFields,
          },
          {
            tag: "div",
            text: { tag: "lark_md", content: `**线索**\n${clueStr}` },
          },
          ...(!pageReady && pageUrl ? [{
            tag: "div",
            text: {
              tag: "lark_md",
              content: "页面还在等待 Vercel 完成部署，本条通知先不附详情链接，通常 1-2 分钟后即可访问。",
            },
          }] : []),
          ...(pageReady && pageUrl ? [{
            tag: "action",
            actions: [{
              tag: "button",
              text: { tag: "plain_text", content: "查看页面" },
              type: "primary",
              url: pageUrl,
            }],
          }] : []),
        ],
      },
    };
    try {
      const feishuRes = await fetch(feishuWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
      console.log(`[new-site] 飞书通知: ${feishuRes.status}`);
    } catch (err) {
      console.warn(`[new-site] 飞书通知失败: ${err}`);
    }
  }

  console.log(`[new-site] GitHub publish complete for #${puzzleNumber} (${detailState})`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function triggerNewSiteRevalidate(
  env: Env,
  puzzleNumber: number,
  mode: "default" | "live" = "default",
): Promise<boolean> {
  const newSiteUrl = String(env.NEW_SITE_URL || "").trim();
  const revalidateSecret = String(env.NEW_SITE_REVALIDATE_SECRET || "").trim();
  if (!newSiteUrl || !revalidateSecret) {
    return false;
  }

  const slug = `pinpoint-answer-${puzzleNumber}`;
  const revalidateUrl = `${newSiteUrl}/api/revalidate?slug=${encodeURIComponent(slug)}${mode === "live" ? "&mode=live" : ""}`;

  try {
    const revalRes = await fetch(revalidateUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${revalidateSecret}`,
        "x-revalidate-secret": revalidateSecret,
      },
    });
    console.log(`[new-site] live refresh revalidate: ${revalRes.status}`);
    return revalRes.ok;
  } catch (error) {
    console.warn("[new-site] live refresh revalidate failed", error);
    return false;
  }
}

async function maybeRefreshNewSiteLiveFallback(
  env: Env,
  puzzleDate: string,
  doc: Doc,
  reason: string | undefined,
): Promise<NewSiteLiveRefreshResult> {
  if (!envFlag(env.NEW_SITE_LIVE_REFRESH_ENABLED, false)) {
    return { applied: false };
  }

  if (!shouldUseDirectNewSiteFallback(reason) || !hasNewSiteRevalidateConfig(env)) {
    return { applied: false };
  }

  const publicSiteBaseUrl = getPublicSiteBaseUrl(env);
  const words = extractWordsFromDoc(doc);
  const puzzleNumber = inferPuzzleNumber((doc as unknown as { puzzleNumber?: unknown }).puzzleNumber, puzzleDate);
  const payload = createQuickPayload(publicSiteBaseUrl, puzzleDate, doc, puzzleNumber, words);
  const detailUrl = `${publicSiteBaseUrl}/linkedin-pinpoint-answers/pinpoint-answer-${puzzleNumber}/`;
  const signature = (await sha256Hex(JSON.stringify({ puzzleNumber, payload, mode: "live-refresh" }))).slice(0, 24);
  const doneKey = newSiteLiveRefreshDoneKeyOf(puzzleDate, signature);
  const runningKey = newSiteLiveRefreshRunningKeyOf(puzzleDate, signature);

  if (await env.PP_DATA.get(doneKey)) {
    console.log("[new-site] live refresh fallback already satisfied", {
      puzzleDate,
      puzzleNumber,
      signature,
    });
    return {
      applied: false,
      alreadyDone: true,
      detailUrl,
      payload,
      puzzleNumber,
    };
  }
  if (await env.PP_DATA.get(runningKey)) {
    console.log("[new-site] live refresh fallback skipped (already running)", {
      puzzleDate,
      puzzleNumber,
      signature,
    });
    return { applied: false };
  }

  await env.PP_DATA.put(runningKey, new Date().toISOString(), {
    expirationTtl: 60 * 30,
  });

  try {
    const refreshed = await triggerNewSiteRevalidate(env, puzzleNumber, "live");
    if (!refreshed) {
      return { applied: false };
    }
    await env.PP_DATA.put(doneKey, new Date().toISOString(), {
      expirationTtl: 60 * 60 * 24 * 14,
    });
  } finally {
    await env.PP_DATA.delete(runningKey);
  }

  console.warn("[new-site] live refresh fallback used", {
    puzzleDate,
    puzzleNumber,
    reason: reason || "unknown",
  });

  return {
    applied: true,
    detailUrl,
    payload,
    puzzleNumber,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function enrichPublishToSite(
  env: Env,
  puzzleDate: string,
  doc: Doc,
  options: EnrichPublishOptions = {},
): Promise<EnrichPublishResult> {
  const enabled = envFlag(env.AUTO_ENRICH_ENABLED, true);
  if (!enabled) {
    return { status: "skipped", reason: "AUTO_ENRICH_ENABLED=false" };
  }

  const siteBaseUrl = getPublicSiteBaseUrl(env);

  const token = String(env.SITE_API_TOKEN || "").trim();
  if (!token) {
    return { status: "skipped", reason: "SITE_API_TOKEN missing" };
  }

  const doneKey = enrichPublishDoneKeyOf(puzzleDate);
  const runningKey = enrichPublishRunningKeyOf(puzzleDate);
  if (await env.PP_DATA.get(doneKey)) {
    return { status: "skipped", reason: "enrich already done today" };
  }
  if (await env.PP_DATA.get(runningKey)) {
    return { status: "skipped", reason: "enrich already running" };
  }

  await env.PP_DATA.put(runningKey, new Date().toISOString(), {
    expirationTtl: 60 * 30,
  });

  const words = extractWordsFromDoc(doc);
  const puzzleNumber = inferPuzzleNumber((doc as unknown as { puzzleNumber?: unknown }).puzzleNumber, puzzleDate);
  const answer = sanitizePublishedAnswerLabel(doc.mainAnswer || doc.theme || "Pinpoint connector") || "Pinpoint connector";
  const timeoutMs = parseTimeoutMs(env.AUTO_ENRICH_TIMEOUT_MS, 55_000);
  const enrichModel = selectModel(env.AUTO_ENRICH_MODEL, "google/gemini-2.0-flash-001");
  const retryModel = selectModel(env.AUTO_ENRICH_RETRY_MODEL, enrichModel);
  const draftAttempts = parseAttemptCount(env.AUTO_ENRICH_DRAFT_ATTEMPTS, 2, 3);
  const generatingPayload = buildNewSiteStatusPayload(
    siteBaseUrl,
    puzzleDate,
    doc,
    puzzleNumber,
    words,
    "generating",
  );
  const failedPayload = buildNewSiteStatusPayload(
    siteBaseUrl,
    puzzleDate,
    doc,
    puzzleNumber,
    words,
    "failed",
  );

  try {
    try {
      await publishToNewSiteGitHub(env, puzzleDate, doc, generatingPayload, puzzleNumber);
      await options.onDetailStateChange?.("generating");
    } catch (statusError) {
      console.warn("[new-site] generating state publish failed (non-fatal):", statusError);
    }

    let draftResp: JsonRecord | null = null;
    let lastDraftError: unknown = null;
    let qualityGateSummary = "";
    let publishDetailState: PublicDetailState = "published";
    for (let attempt = 1; attempt <= draftAttempts; attempt += 1) {
      const draftModel = attempt === 1 ? enrichModel : retryModel;
      try {
        draftResp = await postSiteJson(
          `${siteBaseUrl}/api/admin/generate-draft`,
          token,
          {
            type: "draft",
            model: draftModel,
            puzzleNumber,
            rawWords: words,
            mainAnswer: answer,
          },
          timeoutMs,
        );
        break;
      } catch (error) {
        lastDraftError = error;
        if (!isDraftQualityGateError(error)) {
          throw error;
        }
        qualityGateSummary = extractDraftFailureSummary(error);
        if (attempt >= draftAttempts) {
          publishDetailState = "fallback_full";
          const fallbackPayload = buildTemplateFallbackPayload(siteBaseUrl, puzzleDate, doc, puzzleNumber, words);
          const reason = `quality gate blocked after ${draftAttempts} attempt(s): ${qualityGateSummary}; used fallback_full`;
          await notifyCron(env, "⚠️ Worker 草稿质量未过线，已切换为 fallback_full 保底全文页", [
            `日期: ${puzzleDate}`,
            `谜题: #${puzzleNumber}`,
            `答案: ${answer}`,
            `尝试次数: ${draftAttempts}`,
            `结果: AI 长文未过线，已切换为 fallback_full 保底全文页`,
            `原因: ${qualityGateSummary || "draft quality gate blocked"}`,
          ]);
          draftResp = {
            success: true,
            data: fallbackPayload,
          };
          lastDraftError = null;
          console.warn("[enrich] draft blocked by quality gates; switched to fallback_full", {
            puzzleDate,
            puzzleNumber,
            attempt,
            draftAttempts,
            reason,
          });
          break;
        }
        const reason = error instanceof Error ? error.message : String(error);
        const delayMs = 800 * attempt;
        console.warn("[enrich] draft blocked by quality gates; regenerating", {
          puzzleDate,
          puzzleNumber,
          attempt,
          draftAttempts,
          model: draftModel,
          nextModel: retryModel,
          reason,
        });
        await sleep(delayMs);
      }
    }
    if (!draftResp) {
      throw (lastDraftError instanceof Error ? lastDraftError : new Error("draft generation failed"));
    }
    const success = Boolean(draftResp.success);
    if (!success) {
      const message = typeof draftResp.message === "string" ? draftResp.message : "draft generation failed";
      throw new Error(message);
    }

    const draftData = asRecord(draftResp.data);
    const draftSections = asRecord(draftData?.sections);
    const draftAnalysis = asRecord(draftData?.analysis);
    const draftSlots = asRecord(draftData?.slots);
    const draftMetadata = asRecord(draftData?.metadata);
    const draftEvidence = extractProvidedEvidenceFields(draftData ?? {});

    const fallbackPayload = createQuickPayload(siteBaseUrl, puzzleDate, doc, puzzleNumber, words);
    const enrichedPayload: JsonRecord = {
      ...fallbackPayload,
      analysis: {
        ...fallbackPayload.analysis,
        detailedBreakdown: String(draftAnalysis?.detailedBreakdown || fallbackPayload.analysis.detailedBreakdown),
        dailyDebrief: String(draftAnalysis?.dailyDebrief || fallbackPayload.analysis.dailyDebrief),
      },
      summary: String(draftAnalysis?.heroSummary || draftData?.summary || fallbackPayload.summary),
      detailState: publishDetailState,
      ...draftEvidence,
      seoDescription: typeof draftAnalysis?.seoDescription === "string" ? draftAnalysis.seoDescription : undefined,
      seo: typeof draftAnalysis?.seoTitle === "string" ? { title: draftAnalysis.seoTitle } : undefined,
      sections: buildEnrichedSections(draftSections, asRecord(fallbackPayload.sections)),
      ...(draftSlots ? { slots: draftSlots } : {}),
      metadata: {
        publishedAtSource:
          typeof draftMetadata?.publishedAtSource === "string"
            ? String(draftMetadata.publishedAtSource)
            : `${siteBaseUrl}/api/admin/generate-draft`,
        publishedAtConfidence:
          typeof draftMetadata?.publishedAtConfidence === "number"
            ? Number(draftMetadata.publishedAtConfidence)
            : 1,
      },
    };

    if (publishDetailState === "published") {
      const validatedPayload: JsonRecord = {
        ...enrichedPayload,
        detailState: "validated",
      };
      try {
        await publishToNewSiteGitHub(env, puzzleDate, doc, validatedPayload, puzzleNumber);
        await options.onDetailStateChange?.("validated");
      } catch (statusError) {
        console.warn("[new-site] validated state publish failed (non-fatal):", statusError);
      }
    }

    await publishToNewSiteGitHub(env, puzzleDate, doc, enrichedPayload, puzzleNumber);
    await options.onDetailStateChange?.(publishDetailState);

    await env.PP_DATA.put(doneKey, new Date().toISOString(), {
      expirationTtl: 60 * 60 * 24 * 14,
    });
    return {
      status: publishDetailState === "fallback_full" ? "fallback_full" : "enriched",
      puzzleNumber,
      payload: enrichedPayload,
      detailState: publishDetailState,
    };
  } catch (error) {
    try {
      await publishToNewSiteGitHub(env, puzzleDate, doc, failedPayload, puzzleNumber);
      await options.onDetailStateChange?.(
        "failed",
        error instanceof Error ? error.message : String(error),
      );
    } catch (statusError) {
      console.warn("[new-site] failed state publish failed (non-fatal):", statusError);
    }
    throw error;
  } finally {
    await env.PP_DATA.delete(runningKey);
  }
}

async function localizePublishOne(
  env: Env,
  puzzleDate: string,
  locale: string,
  sourcePayload: JsonRecord,
  siteBaseUrl: string,
  token: string,
  timeoutMs: number,
  puzzleNumber: number,
  words: string[],
  answer: string,
  checksumSeed: string,
  doc: Doc,
): Promise<I18nPublishItemResult> {
  const startedAt = Date.now();
  const detailUrl = `${siteBaseUrl}/${locale}/linkedin-pinpoint-answers/pinpoint-answer-${puzzleNumber}/`;
  const localeAutoPublishFreeze = getLocaleAutoPublishFreeze({
    puzzleNumber,
    locale,
  });
  if (localeAutoPublishFreeze.active) {
    console.warn("i18n publish blocked by locale freeze", {
      locale,
      puzzleNumber,
      freezeRange: `${localeAutoPublishFreeze.rangeStart}-${localeAutoPublishFreeze.rangeEnd}`,
      manualPublishEndpoint: "/api/admin/puzzles/publish",
    });
    return {
      locale,
      status: "failed",
      reason: localeAutoPublishFreeze.shortReason,
      durationMs: Date.now() - startedAt,
      detailUrl,
    };
  }
  const doneKey = i18nPublishDoneKeyOf(puzzleDate, locale);
  const runningKey = i18nPublishRunningKeyOf(puzzleDate, locale);
  const i18nModel = selectModel(env.AUTO_I18N_MODEL, "google/gemini-2.0-flash-001");

  if (await env.PP_DATA.get(doneKey)) {
    return {
      locale,
      status: "skipped",
      reason: "i18n already done today",
      durationMs: Date.now() - startedAt,
      detailUrl,
    };
  }
  if (await env.PP_DATA.get(runningKey)) {
    return {
      locale,
      status: "skipped",
      reason: "i18n already running",
      durationMs: Date.now() - startedAt,
      detailUrl,
    };
  }

  await env.PP_DATA.put(runningKey, new Date().toISOString(), {
    expirationTtl: 60 * 20,
  });

  try {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const localizeResp = await postSiteJson(
          `${siteBaseUrl}/api/admin/generate-draft`,
          token,
      {
        type: "localize",
        model: i18nModel,
        targetLocale: locale,
        puzzleNumber,
        rawWords: words,
            mainAnswer: answer,
            sourceDraft: sourcePayload,
          },
          timeoutMs,
        );
        const success = Boolean(localizeResp.success);
        if (!success) {
          const message =
            typeof localizeResp.message === "string"
              ? localizeResp.message
              : `localize failed for locale=${locale}`;
          throw new Error(message);
        }

        const localizedData = asRecord(localizeResp.data) ?? {};
        const localizedSections = asRecord(localizedData.sections);
        const localizedAnalysis = asRecord(localizedData.analysis);

        const localizedSummary = asNonEmptyString(localizedAnalysis?.heroSummary);
        const localizedSeoTitle = asNonEmptyString(localizedAnalysis?.seoTitle);
        const localizedSeoDescription = asNonEmptyString(localizedAnalysis?.seoDescription);

        const sourceAnalysis = asRecord(sourcePayload.analysis);
        const sourceSections = asRecord(sourcePayload.sections);
        const sourceSeo = asRecord(sourcePayload.seo);
        const sourceSummary =
          asNonEmptyString(sourcePayload.summary) ?? asNonEmptyString(sourceAnalysis?.heroSummary);
        const sourceSeoTitle = asNonEmptyString(sourceSeo?.title) ?? asNonEmptyString(sourceAnalysis?.seoTitle);
        const sourceSeoDescription =
          asNonEmptyString(sourcePayload.seoDescription) ?? asNonEmptyString(sourceAnalysis?.seoDescription);

        const localizedNarrativeSeed = getLocaleNarrativeLine(locale, words, answer);
        const clueLine = `Clues: ${words.join(", ")}.`;
        const summaryFallbackPieces = [
          localizedNarrativeSeed,
          clueLine,
          `Puzzle #${puzzleNumber} localized recap (${locale}).`,
        ];
        const adjustedSummarySeed = localizedSummary ?? sourceSummary;
        let adjustedSummary = ensureMinWordsWithinMax(
          sameText(adjustedSummarySeed, sourceSummary)
            ? `[${locale}] ${adjustedSummarySeed}`
            : adjustedSummarySeed,
          I18N_SUMMARY_MIN_WORDS,
          summaryFallbackPieces,
          PUBLISH_SHORT_TEXT_MAX_CHARS,
        );
        if (!adjustedSummary) {
          adjustedSummary = ensureMinWordsWithinMax(
            `[${locale}] ${localizedNarrativeSeed}`,
            I18N_SUMMARY_MIN_WORDS,
            summaryFallbackPieces,
            PUBLISH_SHORT_TEXT_MAX_CHARS,
          ) ?? `[${locale}] ${localizedNarrativeSeed}`;
        }
        if (sameText(adjustedSummary, sourceSummary)) {
          adjustedSummary =
            ensureMinWordsWithinMax(
              `[${locale}] ${adjustedSummary}`,
              I18N_SUMMARY_MIN_WORDS,
              summaryFallbackPieces,
              PUBLISH_SHORT_TEXT_MAX_CHARS,
            ) ?? adjustedSummary;
        }

        const adjustedSeoTitleSeedBase =
          localizedSeoTitle ??
          sourceSeoTitle ??
          `LinkedIn Pinpoint ${puzzleNumber}: ${words.join(", ")}`;
        const adjustedSeoTitleSeed = sameText(adjustedSeoTitleSeedBase, sourceSeoTitle)
          ? `${adjustedSeoTitleSeedBase} (${locale})`
          : adjustedSeoTitleSeedBase;
        const adjustedSeoTitle =
          ensureMaxChars(adjustedSeoTitleSeed, PUBLISH_SHORT_TEXT_MAX_CHARS) ??
          ensureMaxChars(`LinkedIn Pinpoint ${puzzleNumber} (${locale})`, PUBLISH_SHORT_TEXT_MAX_CHARS) ??
          `LinkedIn Pinpoint ${puzzleNumber} (${locale})`;

        const adjustedSeoDescriptionSeedBase =
          localizedSeoDescription ??
          sourceSeoDescription ??
          `${localizedNarrativeSeed} ${clueLine}`;
        const adjustedSeoDescriptionSeed = sameText(adjustedSeoDescriptionSeedBase, sourceSeoDescription)
          ? `[${locale}] ${adjustedSeoDescriptionSeedBase}`
          : adjustedSeoDescriptionSeedBase;
        const adjustedSeoDescription =
          ensureMaxChars(adjustedSeoDescriptionSeed, PUBLISH_SHORT_TEXT_MAX_CHARS) ??
          ensureMaxChars(`${localizedNarrativeSeed} ${clueLine}`, PUBLISH_SHORT_TEXT_MAX_CHARS) ??
          ensureMaxChars(localizedNarrativeSeed, PUBLISH_SHORT_TEXT_MAX_CHARS) ??
          localizedNarrativeSeed;

        const overviewFallbackPieces = [localizedNarrativeSeed, adjustedSummary, clueLine];
        let adjustedOverview =
          ensureMinWordsWithinMax(
            asNonEmptyString(localizedSections?.overview) ??
              asNonEmptyString(localizedAnalysis?.detailedBreakdown) ??
              asNonEmptyString(sourceSections?.overview),
            65,
            overviewFallbackPieces,
            PUBLISH_SECTION_TEXT_MAX_CHARS,
          ) ?? localizedNarrativeSeed;
        if (sameText(adjustedOverview, asNonEmptyString(sourceSections?.overview))) {
          adjustedOverview =
            ensureMinWordsWithinMax(
              `[${locale}] ${adjustedOverview}`,
              65,
              overviewFallbackPieces,
              PUBLISH_SECTION_TEXT_MAX_CHARS,
            ) ?? adjustedOverview;
        }

        const solutionFallbackPieces = [localizedNarrativeSeed, adjustedOverview, adjustedSummary, clueLine];
        let adjustedSolution =
          ensureMinWordsWithinMax(
            asNonEmptyString(localizedSections?.solutionEmergence) ??
              asNonEmptyString(localizedAnalysis?.detailedBreakdown) ??
              asNonEmptyString(sourceSections?.solutionEmergence),
            90,
            solutionFallbackPieces,
            PUBLISH_SECTION_TEXT_MAX_CHARS,
          ) ?? `${localizedNarrativeSeed} ${adjustedOverview}`;
        if (sameText(adjustedSolution, asNonEmptyString(sourceSections?.solutionEmergence))) {
          adjustedSolution =
            ensureMinWordsWithinMax(
              `[${locale}] ${adjustedSolution}`,
              90,
              solutionFallbackPieces,
              PUBLISH_SECTION_TEXT_MAX_CHARS,
            ) ?? adjustedSolution;
        }

        const adjustedClueDetails = ensureLocalizedClueDetails(
          locale,
          words,
          localizedSections?.clueDetails,
          sourceSections?.clueDetails,
        );
        const adjustedSections: JsonRecord = {
          ...(buildEnrichedSections(localizedSections, sourceSections) || {}),
          overview: adjustedOverview,
          solutionEmergence: adjustedSolution,
          clueDetails: adjustedClueDetails,
        };

        const localizedPayload: JsonRecord = {
          ...sourcePayload,
          detailState: resolvePublishDetailState(sourcePayload.detailState),
          summary: adjustedSummary,
          seoDescription: adjustedSeoDescription,
          seo: { title: adjustedSeoTitle },
          analysis: {
            ...(sourceAnalysis || {}),
            detailedBreakdown:
              asNonEmptyString(localizedAnalysis?.detailedBreakdown) ??
              asNonEmptyString(sourceAnalysis?.detailedBreakdown) ??
              "",
            dailyDebrief:
              asNonEmptyString(localizedAnalysis?.dailyDebrief) ??
              asNonEmptyString(sourceAnalysis?.dailyDebrief) ??
              "",
          },
          sections: adjustedSections,
          metadata: {
            publishedAtSource: `${siteBaseUrl}/api/admin/generate-draft`,
            publishedAtConfidence: 1,
          },
        };

        await publishToNewSiteGitHub(env, puzzleDate, doc, localizedPayload, puzzleNumber);

        await env.PP_DATA.put(doneKey, new Date().toISOString(), {
          expirationTtl: 60 * 60 * 24 * 14,
        });

        return {
          locale,
          status: "published",
          durationMs: Date.now() - startedAt,
          detailUrl,
        };
      } catch (attemptError) {
        const message = attemptError instanceof Error ? attemptError.message : String(attemptError);
        const shouldRetry = attempt < maxAttempts && isRetryableI18nError(message);
        if (!shouldRetry) {
          return {
            locale,
            status: "failed",
            reason: message,
            durationMs: Date.now() - startedAt,
            detailUrl,
          };
        }
        await sleep(800 * attempt);
      }
    }

    const message = "i18n localize failed after retries";
    return {
      locale,
      status: "failed",
      reason: message,
      durationMs: Date.now() - startedAt,
      detailUrl,
    };
  } finally {
    await env.PP_DATA.delete(runningKey);
  }
}

async function localizePublishToSite(
  env: Env,
  puzzleDate: string,
  doc: Doc,
  sourcePayload: JsonRecord,
  options: I18nPublishOptions = {},
): Promise<I18nPublishResult> {
  if (options.enabled === false) {
    return { status: "skipped", reason: "auto i18n disabled for this run", results: [] };
  }

  if (!envFlag(env.AUTO_I18N_ENABLED, true)) {
    return { status: "skipped", reason: "AUTO_I18N_ENABLED=false", results: [] };
  }

  const targetLocales = parseTargetLocales(env.AUTO_I18N_LOCALES);
  if (targetLocales.length === 0) {
    return { status: "skipped", reason: "AUTO_I18N_LOCALES empty", results: [] };
  }

  const siteBaseUrl = getPublicSiteBaseUrl(env);

  const token = String(env.SITE_API_TOKEN || "").trim();
  if (!token) {
    return { status: "skipped", reason: "SITE_API_TOKEN missing", results: [] };
  }

  const timeoutMs = parseTimeoutMs(env.AUTO_I18N_TIMEOUT_MS, 30_000);
  const parallel = parseParallelCount(env.AUTO_I18N_PARALLEL);

  const words = extractWordsFromDoc(doc);
  const puzzleNumber = inferPuzzleNumber((doc as unknown as { puzzleNumber?: unknown }).puzzleNumber, puzzleDate);
  const answer = sanitizePublishedAnswerLabel(doc.mainAnswer || doc.theme || "Pinpoint connector") || "Pinpoint connector";
  const checksumSeed = doc.checksum.slice(0, 24);

  let results: I18nPublishItemResult[] = [];
  try {
    results = await mapWithConcurrency(targetLocales, parallel, async (locale) =>
      localizePublishOne(
        env,
        puzzleDate,
        locale,
        sourcePayload,
        siteBaseUrl,
        token,
        timeoutMs,
        puzzleNumber,
        words,
        answer,
        checksumSeed,
        doc,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results = targetLocales.map((locale) => ({
      locale,
      status: "failed",
      reason: `i18n scheduler error: ${message}`,
      durationMs: 0,
      detailUrl: `${siteBaseUrl}/${locale}/linkedin-pinpoint-answers/pinpoint-answer-${puzzleNumber}/`,
    }));
  }

  return { status: "completed", results };
}

async function loadEnrichedPayloadFromSite(
  siteBaseUrl: string,
  puzzleNumber: number,
  timeoutMs: number,
): Promise<JsonRecord | null> {
  const url = `${siteBaseUrl}/api/linkedin-pinpoint-answers/pinpoint-answer-${puzzleNumber}?locale=en`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    },
    timeoutMs,
  );
  if (!res.ok) return null;

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }

  const row = asRecord(json);
  if (!row) return null;
  const rowPuzzleNumber = Number.parseInt(String(row.puzzleNumber ?? puzzleNumber), 10);
  const rowRawWords = Array.isArray(row.rawWords)
    ? row.rawWords
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0)
    : [];
  const rowMainAnswer = asNonEmptyString(row.mainAnswer) ?? asNonEmptyString(row.theme);
  const rowPublishedAtIso = asNonEmptyString(row.publishedAt);
  const sections = asRecord(row.sections);
  const analysis = asRecord(row.analysis);
  const summary =
    asNonEmptyString(row.summary) ??
    asNonEmptyString(analysis?.heroSummary);
  if (!sections || !analysis || !summary) return null;
  if (!Number.isFinite(rowPuzzleNumber) || rowPuzzleNumber <= 0) return null;
  if (rowRawWords.length < 4) return null;

  const seoRow = asRecord(row.seo);
  const seoTitle =
    asNonEmptyString(seoRow?.title) ??
    asNonEmptyString(analysis?.seoTitle);
  const seoDescription =
    asNonEmptyString(row.seoDescription) ??
    asNonEmptyString(analysis?.seoDescription);

  return {
    puzzleNumber: rowPuzzleNumber,
    rawWords: rowRawWords,
    ...(rowMainAnswer ? { mainAnswer: rowMainAnswer } : {}),
    summary,
    sections,
    analysis: {
      ...analysis,
      heroSummary: summary,
      ...(seoTitle ? { seoTitle } : {}),
      ...(seoDescription ? { seoDescription } : {}),
    },
    ...(rowPublishedAtIso ? { publishedAtIso: rowPublishedAtIso } : {}),
    ...(seoTitle ? { seo: { title: seoTitle } } : {}),
    ...(seoDescription ? { seoDescription } : {}),
  };
}

async function sha256Hex(s: string) {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, "0")).join("");
}

async function buildMockDoc(date: string): Promise<Doc> {
  const answers: Answer[] = [
    { rank: 1, word: "MOCK", confidence: undefined },
    { rank: 2, word: "DATA", confidence: undefined },
  ];
  const fetchedAt = new Date().toISOString();
  const checksum = `sha256:${await sha256Hex(JSON.stringify(answers))}`;
  return { version: 1, puzzleDate: date, answers, source: "graphql", fetchedAt, checksum };
}

async function notifyCron(env: Env, title: string, lines: string[]): Promise<void> {
  const text = [title, ...lines].join("\n");
  const feishu = String(env.FEISHU_WEBHOOK_URL || env.ALERT_WEBHOOK_URL || "").trim();
  const slack = String(env.SLACK_WEBHOOK_URL || "").trim();
  const tasks: Promise<unknown>[] = [];

  if (feishu) {
    tasks.push(
      fetch(feishu, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ msg_type: "text", content: { text } }),
      }).catch(() => undefined)
    );
  }

  if (slack) {
    tasks.push(
      fetch(slack, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => undefined)
    );
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

/**
 * Returns true if a success notification has already been sent for this date.
 * Stores a dedup flag in KV with 48-hour TTL to prevent duplicate notifications
 * when the cron fires multiple times on the same day.
 */
async function checkAndMarkCronSuccessNotified(env: Env, date: string): Promise<boolean> {
  const key = `notify:cron:success:${date}`;
  try {
    const existing = await env.PP_DATA.get(key);
    if (existing !== null) {
      return true; // already notified
    }
    await env.PP_DATA.put(key, "1", { expirationTtl: 172800 }); // 48 hours
    return false;
  } catch {
    return false; // on KV error, allow notification through
  }
}

function toZhWebhookReason(reason: string | undefined): string {
  const raw = String(reason || "").trim();
  if (!raw) return "未提供原因";

  if (raw.startsWith("stale candidate:")) {
    const detail = raw.slice("stale candidate:".length).trim();
    return detail ? `疑似旧数据：${detail}` : "疑似旧数据";
  }

  if (raw.startsWith("i18n scheduler error:")) {
    const detail = raw.slice("i18n scheduler error:".length).trim();
    return detail ? `多语言调度错误：${detail}` : "多语言调度错误";
  }

  if (raw.startsWith("new-site live refresh fallback:")) {
    const detail = raw.slice("new-site live refresh fallback:".length).trim();
    return detail ? `旧发布链路不可用，已改走新站实时刷新：${toZhWebhookReason(detail)}` : "旧发布链路不可用，已改走新站实时刷新";
  }

  if (raw.startsWith("quality gate blocked after")) {
    const detail = raw.split(":").slice(1).join(":").trim();
    if (
      raw.includes("used fallback_full") ||
      raw.includes("used short fallback") ||
      raw.includes("used template fallback")
    ) {
      return detail ? `草稿质量未过线，已切换为保底全文页：${detail}` : "草稿质量未过线，已切换为保底全文页";
    }
    return detail ? `草稿质量未过线：${detail}` : "草稿质量未过线，已保留快版内容";
  }

  const map: Record<string, string> = {
    "same as yesterday": "与昨天相同",
    unknown: "未知",
    "no reason": "未提供原因",
    "unknown error": "未知错误",
    "unknown skip reason": "未知跳过原因",
    "stale candidate": "疑似旧数据",

    "quick publish already done today": "今天已完成快速发布",
    "quick publish not ready": "快速发布未就绪",
    "quick publish failed": "快速发布失败",
    "not published": "未发布",

    "AUTO_PUBLISH_ENABLED=false": "已关闭自动快速发布（AUTO_PUBLISH_ENABLED=false）",
    "AUTO_ENRICH_ENABLED=false": "已关闭自动增强（AUTO_ENRICH_ENABLED=false）",
    "AUTO_I18N_ENABLED=false": "已关闭自动多语言（AUTO_I18N_ENABLED=false）",
    "AUTO_I18N_LOCALES empty": "未配置多语言列表（AUTO_I18N_LOCALES 为空）",
    "auto i18n disabled for this run": "本次运行按英文站策略跳过自动多语言",
    "SITE_API_TOKEN missing": "缺少站点 API Token（SITE_API_TOKEN）",
    "legacy site pipeline unavailable": "旧发布后端未配置，或仍指向新站正式域名",

    "enrich already done today": "今天已完成增强",
    "enrich already running": "增强任务正在运行",
    "enrich failed": "增强失败",
    "enrich payload missing": "缺少增强内容",
    "not needed": "无需执行",
    "not enabled": "未启用",

    "i18n already done today": "今天已完成多语言",
    "i18n already running": "多语言任务正在运行",
    [AUTO_LOCALE_PUBLISH_FREEZE_SHORT_REASON]: "多语言自动发布已冻结（#664-#675 仅允许人工热修）",
  };

  return map[raw] ?? raw;
}

function buildCronHeartbeat(date: string, options: BuildCronHeartbeatOptions = {}): CronHeartbeat {
  const now = new Date().toISOString();
  const baseStage: CronHeartbeatStage = { status: "unknown", updatedAt: now };
  const source = options.source ?? "worker-scheduled";
  const triggerKind = options.triggerKind ?? "scheduled";
  const publishEnabled = options.publishEnabled ?? true;
  const forcePublish = options.forcePublish ?? false;
  const runSeed = options.requestId?.trim() || String(Date.now());
  return {
    version: 1,
    runId: `${date}:${source}:${runSeed}`,
    source,
    triggerKind,
    requestId: options.requestId?.trim() || undefined,
    date,
    startedAt: now,
    updatedAt: now,
    triggerSeen: false,
    publishEnabled,
    forcePublish,
    outcome: "running",
    quickPublish: { ...baseStage },
    enrich: { ...baseStage },
    i18n: { ...baseStage },
  };
}

function stampHeartbeatStage(
  stage: CronHeartbeatStage,
  status: CronHeartbeatStageStatus,
  reason?: string,
): CronHeartbeatStage {
  return {
    ...stage,
    status,
    ...(reason ? { reason } : {}),
    ...(!reason ? { reason: undefined } : {}),
    updatedAt: new Date().toISOString(),
  };
}

function stampHeartbeatDetailState(
  stage: CronHeartbeatStage,
  detailState: PublishDetailState,
  reason?: string,
): CronHeartbeatStage {
  return {
    ...stage,
    detailState,
    ...(reason ? { reason } : {}),
    ...(!reason ? { reason: stage.reason } : {}),
    updatedAt: new Date().toISOString(),
  };
}

function getHeartbeatStageStatusForDetailState(detailState: PublishDetailState): CronHeartbeatStageStatus {
  if (detailState === "published" || detailState === "fallback_full") {
    return "published";
  }
  if (detailState === "failed") {
    return "failed";
  }
  return "queued";
}

export function buildCronHeartbeatAlerts(
  heartbeat: CronHeartbeat | null,
  nowMs: number = Date.now(),
): Array<{
  code: string;
  severity: "warning";
  detailState: PublishDetailState;
  minutesStuck: number;
  message: string;
}> {
  if (!heartbeat) return [];

  const detailState = heartbeat.enrich.detailState;
  if (detailState !== "generating" && detailState !== "validated") {
    return [];
  }

  const updatedAtMs = Date.parse(heartbeat.enrich.updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return [];
  }

  const ageMs = Math.max(0, nowMs - updatedAtMs);
  if (ageMs < nonPublicDetailStateAlertThresholdMs) {
    return [];
  }

  const minutesStuck = Math.floor(ageMs / 60000);
  return [
    {
      code: "detail_state.stuck",
      severity: "warning",
      detailState,
      minutesStuck,
      message: `Enrich detailState has stayed at ${detailState} for ${minutesStuck} minute(s).`,
    },
  ];
}

async function checkAndMarkDetailStateAlertNotified(
  env: Env,
  heartbeat: CronHeartbeat,
  detailState: PublishDetailState,
): Promise<boolean> {
  const updatedAt = String(heartbeat.enrich.updatedAt || "").trim();
  if (!updatedAt) return false;

  const key = `notify:cron:detail-state:${heartbeat.date}:${detailState}:${updatedAt}`;
  try {
    const existing = await env.PP_DATA.get(key);
    if (existing !== null) {
      return true;
    }
    await env.PP_DATA.put(key, "1", { expirationTtl: 172800 });
    return false;
  } catch {
    return false;
  }
}

async function maybeNotifyCronHeartbeatAlerts(env: Env, heartbeat: CronHeartbeat): Promise<void> {
  if (!hasNotifyWebhook(env)) return;

  const alerts = buildCronHeartbeatAlerts(heartbeat);
  if (alerts.length === 0) return;

  for (const alert of alerts) {
    const alreadyNotified = await checkAndMarkDetailStateAlertNotified(
      env,
      heartbeat,
      alert.detailState,
    );
    if (alreadyNotified) continue;

    await notifyCron(env, "⚠️ Worker 详情状态停滞告警", [
      `日期: ${heartbeat.date}`,
      `运行: ${heartbeat.runId}`,
      `状态: ${alert.detailState}`,
      `停留分钟: ${alert.minutesStuck}`,
      `说明: ${alert.message}`,
      `阶段原因: ${toZhWebhookReason(heartbeat.enrich.reason)}`,
    ]);
  }
}

async function readCronHeartbeatRunIds(env: Env, date: string): Promise<string[]> {
  const raw = await env.PP_DATA.get(cronHeartbeatDayRunsKeyOf(date));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
}

async function loadCronHeartbeatRuns(env: Env, date: string, limit: number): Promise<CronHeartbeat[]> {
  const runIds = (await readCronHeartbeatRunIds(env, date)).slice(0, Math.max(1, Math.min(limit, cronHeartbeatRunsLimit)));
  const rawRuns = await Promise.all(runIds.map((runId) => env.PP_DATA.get(cronHeartbeatRunKeyOf(runId))));
  const runs: CronHeartbeat[] = [];
  for (const raw of rawRuns) {
    if (!raw) continue;
    try {
      runs.push(JSON.parse(raw) as CronHeartbeat);
    } catch {}
  }
  return runs;
}

async function persistCronHeartbeat(env: Env, heartbeat: CronHeartbeat): Promise<void> {
  heartbeat.updatedAt = new Date().toISOString();
  const raw = JSON.stringify(heartbeat);
  const ttl = 60 * 60 * 24 * 30;
  const runIds = [heartbeat.runId, ...(await readCronHeartbeatRunIds(env, heartbeat.date)).filter((item) => item !== heartbeat.runId)]
    .slice(0, cronHeartbeatRunsLimit);
  await Promise.all([
    env.PP_DATA.put(cronHeartbeatLatestKey, raw, { expirationTtl: ttl }),
    env.PP_DATA.put(cronHeartbeatDayKeyOf(heartbeat.date), raw, { expirationTtl: ttl }),
    env.PP_DATA.put(cronHeartbeatRunKeyOf(heartbeat.runId), raw, { expirationTtl: ttl }),
    env.PP_DATA.put(cronHeartbeatDayRunsKeyOf(heartbeat.date), JSON.stringify(runIds), { expirationTtl: ttl }),
  ]);
  await maybeNotifyCronHeartbeatAlerts(env, heartbeat);
}

function extractCookie(rawCookie: string | undefined, name: string): string | undefined {
  if (!rawCookie) return undefined;
  try {
    const parts = rawCookie.split(";");
    for (const part of parts) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const n = trimmed.slice(0, eq);
      const v = trimmed.slice(eq + 1);
      if (n.toLowerCase() === name.toLowerCase()) {
        return v;
      }
    }
  } catch {}
  return undefined;
}

function decodeHtmlish(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#61;/g, "=")
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_m, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&#(\d{1,7});/g, (_m, num) => {
      const code = Number.parseInt(num, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/\\u003D/g, "=")
    .replace(/\\u0026/g, "&");
}

function parseStringArray(rawList: string | undefined): string[] {
  if (!rawList) return [];
  try {
    const arr = JSON.parse(`[${rawList}]`);
    if (Array.isArray(arr)) {
      return arr
        .map((v: unknown) => (typeof v === "string" ? v : String(v ?? "")))
        .map((v: string) => v.trim())
        .filter((v: string) => v.length > 0);
    }
  } catch {}

  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawList)) !== null) {
    const val = m[1]
      .replace(/\\"/g, "\"")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .trim();
    if (val) out.push(val);
  }
  return out;
}

async function fetchPinpointFromLinkedInHtml(date: string, rawCookie: string, userAgent: string): Promise<Doc | null> {
  const cookie = (rawCookie || "").trim();
  if (!cookie) return null;

  const res = await fetch("https://www.linkedin.com/games/pinpoint/", {
    method: "GET",
    headers: {
      cookie,
      "user-agent": userAgent,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://www.linkedin.com/",
    },
  });
  if (!res.ok) return null;

  const html = await res.text();
  const decoded = decodeHtmlish(html);

  const cluesMatch = decoded.match(/"clues"\s*:\s*\[(.*?)\]/s);
  const solutionsMatch = decoded.match(/"solutions"\s*:\s*\[(.*?)\]/s);
  const clues = parseStringArray(cluesMatch?.[1]).slice(0, 5);
  if (clues.length < 5) return null;
  const solutions = parseStringArray(solutionsMatch?.[1]);
  const mainAnswer = solutions.find((s) => s.trim().length > 0);
  const theme = mainAnswer;

  const answers: Answer[] = clues.map((word, i) => ({
    rank: i + 1,
    word,
    confidence: undefined,
  }));

  const fetchedAt = new Date().toISOString();
  const checksum = `sha256:${await sha256Hex(JSON.stringify(answers))}`;
  return {
    version: 1,
    puzzleDate: date,
    answers,
    source: "graphql",
    fetchedAt,
    checksum,
    theme,
    mainAnswer: mainAnswer || theme,
  };
}

const ALLOWED_ORIGIN = "https://pinpointanswertoday.app";
const RL_WINDOW_MS = 60_000; // 1 min
const RL_LIMIT = 10; // 每分钟 10 次
const rlTable = new Map<string, { count: number; resetAt: number }>();

function getClientIP(req: Request): string {
  const h = req.headers;
  const ip =
    h.get("cf-connecting-ip") ||
    (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return ip;
}

function isAllowedOrigin(req: Request): { allowed: boolean; origin?: string } {
  const origin = req.headers.get("origin") || undefined;
  if (!origin) return { allowed: true }; // server-to-server
  return { allowed: origin === ALLOWED_ORIGIN, origin };
}

function corsHeaders(origin?: string): HeadersInit {
  const h: Record<string, string> = {
    "vary": "origin",
  };
  if (origin) h["access-control-allow-origin"] = origin;
  return h;
}

function preflightIfNeeded(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  const { allowed, origin } = isAllowedOrigin(req);
  if (!allowed) return new Response("forbidden", { status: 403 });
  const h = new Headers({
    ...corsHeaders(origin),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "120",
  });
  return new Response(null, { status: 204, headers: h });
}

function checkRate(path: string, req: Request): Response | null {
  const ip = getClientIP(req);
  const key = `${ip}|${path}`;
  const now = Date.now();
  const cur = rlTable.get(key);
  if (!cur || now >= cur.resetAt) {
    rlTable.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
    return null;
  }
  cur.count += 1;
  if (cur.count > RL_LIMIT) {
    const { origin } = isAllowedOrigin(req);
    const h = new Headers({ "content-type": "application/json", ...corsHeaders(origin) });
    return new Response(JSON.stringify({ code: 429, message: "rate limit exceeded", data: null }), { status: 429, headers: h });
  }
  return null;
}

async function fetchGraphQLFor(env: Env, date: string): Promise<Doc> {
  const endpoint = (env.VOYAGER_GRAPHQL_ENDPOINT || env.GRAPHQL_ENDPOINT || "").trim();
  if (!endpoint) throw new Error("VOYAGER_GRAPHQL_ENDPOINT/GRAPHQL_ENDPOINT not set");

  const allowSelfGraphQL = (env.ALLOW_SELF_GRAPHQL || "").toLowerCase() === "true";
  const isSelfEndpoint =
    endpoint.startsWith("self://") ||
    /pinpoint-worker/i.test(endpoint) ||
    endpoint.includes(".workers.dev");

  if (isSelfEndpoint) {
    if (!allowSelfGraphQL) {
      throw new Error("GRAPHQL_ENDPOINT 指向 Worker 自身，且未显式允许。请设置 ALLOW_SELF_GRAPHQL=true 或提供真实上游。");
    }
    return await buildMockDoc(date);
  }

  let body: JsonRecord | undefined;
  try {
    const opsRaw = await env.PP_DATA.get("gql:pinpoint:ops");
    if (opsRaw) {
      const ops = JSON.parse(opsRaw) as GraphQLOperationsConfig;
      const list = Array.isArray(ops.operations) ? ops.operations : [];
      const pick =
        list.find((o) => o?.isPrimary) ||
        list.find((o) => /daily/i.test(String(o?.operationName || ""))) ||
        list[0];
      if (pick) {
        const variables = { ...(pick.variables || {}), date } as JsonRecord;
        body = {
          operationName: pick.operationName || "DailyBoard",
          variables,
          ...(pick.sha256Hash
            ? { extensions: { persistedQuery: { version: 1, sha256Hash: pick.sha256Hash } } }
            : {}),
        };
      }
    }
  } catch {

  }

  if (!body) {
    body = {

      query: "query Pinpoint($date:String!){pinpoint(date:$date){theme answers{rank word confidence}}}",
      variables: { date },
    };
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.GRAPHQL_TOKEN) headers.authorization = `Bearer ${env.GRAPHQL_TOKEN}`;
  let mergedCookie = env.GRAPHQL_COOKIE || "";

  headers["accept"] = "application/json, application/vnd.linkedin.normalized+json+2.1;q=0.9";
  headers["accept-language"] = "en-US,en;q=0.9";
  headers["user-agent"] =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
  headers["x-restli-protocol-version"] = "2.0.0";
  headers["x-li-lang"] = "en_US";
  headers["x-li-track"] = '{"clientVersion":"1.0.0"}';
  headers["x-requested-with"] = "XMLHttpRequest";
  headers["origin"] = "https://www.linkedin.com";
  headers["referer"] = "https://www.linkedin.com/games/pinpoint";

  try {
    const hasJ = !!extractCookie(mergedCookie, "JSESSIONID");
    if (!hasJ) {
      const preHeaders: Record<string, string> = {
        cookie: mergedCookie,
        "user-agent": headers["user-agent"],
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": headers["accept-language"],
        referer: "https://www.linkedin.com/",
      };
      const pre = await fetch("https://www.linkedin.com/", {
        method: "GET",
        headers: preHeaders,
      });
      const setCookie = pre.headers.get("set-cookie") || "";
      const m = setCookie.match(/JSESSIONID=([^;]+)/);
      if (m && m[1]) {
        const jsession = m[1].replace(/"/g, "");
        mergedCookie = mergedCookie ? `${mergedCookie}; JSESSIONID=${jsession}` : `JSESSIONID=${jsession}`;
        headers["csrf-token"] = `ajax:${jsession}`;
      }
    }
  } catch {}

  try {
    const jInCookie = extractCookie(mergedCookie, "JSESSIONID");
    if (jInCookie && !headers["csrf-token"]) {
      headers["csrf-token"] = jInCookie.startsWith("ajax:") ? jInCookie : `ajax:${jInCookie}`;
    }
  } catch {}

  if (mergedCookie) headers.cookie = mergedCookie;

  const tryHtmlFallback = async (): Promise<Doc | null> => {
    try {
      return await fetchPinpointFromLinkedInHtml(date, mergedCookie || env.GRAPHQL_COOKIE || "", headers["user-agent"]);
    } catch {
      return null;
    }
  };

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    const htmlDoc = await tryHtmlFallback();
    if (htmlDoc) return htmlDoc;
    throw e;
  }
  if (!res.ok) {
    const htmlDoc = await tryHtmlFallback();
    if (htmlDoc) return htmlDoc;
    throw new Error(`graphql ${res.status}`);
  }

  const j = await res.json().catch(() => ({})) as GraphQLPayload;
  const raw =
    j?.data?.pinpoint?.answers ??
    j?.answers ??
    [];
  const answers = toAnswers(raw);

  let theme: string | undefined;
  let mainAnswer: string | undefined;
  try {
    const tRaw =
      j?.data?.pinpoint?.theme ??
      j?.data?.theme ??
      j?.theme ??
      j?.data?.pinpoint?.answer?.theme ??
      j?.data?.answer?.theme ??
      j?.data?.pinpoint?.finalAnswer ??
      j?.data?.pinpoint?.board?.theme ??
      j?.data?.board?.theme ??
      j?.data?.pinpoint?.categoryTitle ??
      j?.data?.pinpoint?.category;
    if (typeof tRaw === "string") {
      const trimmed = decodeHtmlish(tRaw).trim();
      if (trimmed) theme = trimmed;
    }
    const mRaw =
      j?.data?.pinpoint?.finalAnswer ??
      j?.data?.finalAnswer ??
      j?.finalAnswer ??
      j?.data?.pinpoint?.answer?.text ??
      j?.data?.answer?.text ??
      j?.data?.pinpoint?.mainAnswer ??
      j?.mainAnswer;
    if (typeof mRaw === "string") {
      const mt = decodeHtmlish(mRaw).trim();
      if (mt) mainAnswer = mt;
    }

    if (!theme) {
      const cluesRaw = j?.data?.pinpoint?.clues ?? j?.clues ?? [];
      if (Array.isArray(cluesRaw)) {
        const texts: string[] = cluesRaw
          .map((c) => {
            if (typeof c === "string") return decodeHtmlish(c);
            const row = asRecord(c);
            return decodeHtmlish(String(row?.text ?? row?.label ?? row?.title ?? ""));
          })
          .filter((s: string) => !!s && s.trim().length > 0);
        const candidate = texts.find((t: string) =>
          /Theme|words that|comes before|comes after|start with|end with/i.test(t)
        );
        if (candidate) theme = candidate.trim();
      }
    }
  } catch {}

  if (!answers.length) {
    const htmlDoc = await tryHtmlFallback();
    if (htmlDoc) return htmlDoc;
    throw new Error("graphql: no answers");
  }

  const fetchedAt = new Date().toISOString();
  const checksum = `sha256:${await sha256Hex(JSON.stringify(answers))}`;

  if (!mainAnswer && theme) mainAnswer = theme;
  return { version: 1, puzzleDate: date, answers, source: "graphql", fetchedAt, checksum, theme, mainAnswer };
}

class FallbackNotReadyError extends Error {
  status: number;
  retryAfterSec?: number;

  constructor(status: number, retryAfterSec?: number) {
    super("fallback not ready");
    this.name = "FallbackNotReadyError";
    this.status = status;
    if (retryAfterSec != null) {
      this.retryAfterSec = retryAfterSec;
    }
  }
}

async function callPlaywrightFallback(env: Env, date: string, mode: FallbackMode = "auto"): Promise<Doc> {
  const url = (env.FALLBACK_WEBHOOK || "").trim();
  if (!url) throw new Error("FALLBACK_WEBHOOK not set");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.FALLBACK_WEBHOOK_SECRET ? { "x-webhook-secret": (env.FALLBACK_WEBHOOK_SECRET || "").trim() } : {}),
    },
    body: JSON.stringify({ date, mode }),
  });
  if (!res.ok) {
    let remoteError = "";
    try {
      const body = asRecord(await res.json());
      remoteError = typeof body?.error === "string" ? body.error.trim() : "";
    } catch {}

    const retryAfterRaw = (res.headers.get("retry-after") || "").trim();
    const retryAfterCandidate = retryAfterRaw.length > 0 ? Number.parseInt(retryAfterRaw, 10) : Number.NaN;
    const retryAfterSec = Number.isFinite(retryAfterCandidate) ? retryAfterCandidate : undefined;

    if (res.status === 503 && remoteError === "not ready") {
      throw new FallbackNotReadyError(res.status, retryAfterSec);
    }
    throw new Error(`fallback ${res.status}${remoteError ? `: ${remoteError}` : ""}`);
  }
  const j = await res.json() as FallbackPayload;
  const answers = toAnswers(j?.answers);
  const theme = typeof j?.theme === "string" ? j.theme.trim() : undefined;
  const mainAnswer = typeof j?.mainAnswer === "string" ? j.mainAnswer.trim() : theme;
  const source = normalizeFallbackSource(j?.source);
  const fetchedAt = new Date().toISOString();
  const checksum = `sha256:${await sha256Hex(JSON.stringify(answers))}`;
  return { version: 1, puzzleDate: date, answers, source, fetchedAt, checksum, theme, mainAnswer };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response("ok");
    }

  if (url.pathname === "/graphql") {

    const pre = preflightIfNeeded(req);
    if (pre) return pre;

    const { allowed, origin } = isAllowedOrigin(req);
    if (!allowed) {
      return new Response("forbidden", { status: 403 });
    }

    const rl = checkRate("/graphql", req);
    if (rl) return rl;

    const ct = (req.headers.get("content-type") || "").toLowerCase();
    let body: GraphQLProxyBody | null = null;
    if (req.method === "GET") {
      const q = url.searchParams.get("query") || "";
      const varsRaw = url.searchParams.get("variables") || "";
      let vars: unknown = undefined;
      try { if (varsRaw) vars = JSON.parse(varsRaw); } catch {}
      body = q ? { query: q, ...(vars ? { variables: vars } : {}) } : null;
    } else if (req.method === "POST") {
      if (!ct.startsWith("application/json")) {
        const h = new Headers({ "content-type": "application/json", ...corsHeaders(origin) });
        return new Response(JSON.stringify({ code: 400, message: "JSON required", data: null }), { status: 400, headers: h });
      }
      try {
        const raw = await req.text();
        const parsed = JSON.parse(raw);
        body = (asRecord(parsed) ?? {}) as GraphQLProxyBody;
      } catch {
        const h = new Headers({ "content-type": "application/json", ...corsHeaders(origin) });
        return new Response(JSON.stringify({ code: 400, message: "invalid JSON", data: null }), { status: 400, headers: h });
      }
    } else {
      const h = new Headers({ "content-type": "application/json", ...corsHeaders(origin) });
      return new Response(JSON.stringify({ code: 405, message: "method not allowed", data: null }), { status: 405, headers: h });
    }

    const qStr = String(body?.query || "").toLowerCase();
    if (qStr.includes("mutation")) {
      const h = new Headers({ "content-type": "application/json", ...corsHeaders(origin) });
      return new Response(JSON.stringify({ code: 405, message: "mutations are not allowed", data: null }), { status: 405, headers: h });
    }

    const endpoint = (env.GRAPHQL_ENDPOINT || "").trim();
    if (!endpoint) {
      const h = new Headers({ "content-type": "application/json", ...corsHeaders(origin) });
      return new Response(JSON.stringify({ code: 500, message: "GRAPHQL_ENDPOINT not set", data: null }), { status: 500, headers: h });
    }
    const token = (env.GRAPHQL_TOKEN || "").trim();
    if (!token) {
      const h = new Headers({ "content-type": "application/json", ...corsHeaders(origin) });
      return new Response(JSON.stringify({ code: 500, message: "GRAPHQL_TOKEN not set", data: null }), { status: 500, headers: h });
    }

    const normalized = JSON.stringify({ query: body?.query ?? null, variables: body?.variables ?? null, operationName: body?.operationName ?? null, extensions: body?.extensions ?? null });
    const cacheKey = `${endpoint}#gql/${await sha256Hex(normalized)}`;
    const cacheReq = new Request(cacheKey);
    const cacheStorage = (caches as CacheStorage & { default?: Cache });
    const cache = cacheStorage.default ?? null;
    const cached = cache ? await cache.match(cacheReq) : null;
    if (cached) {

      const ch = new Headers(cached.headers);
      const cc = ch.get("cache-control") || "public, max-age=60";
      const resp = new Response(await cached.text(), { status: 200, headers: { "content-type": "application/json", "cache-control": cc, ...corsHeaders(origin) } });
      return resp;
    }

    const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${token}` };
    const upstream = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await upstream.text();
    const status = upstream.status;
    const h = new Headers({ "content-type": "application/json", "cache-control": "public, max-age=60", ...corsHeaders(origin) });
    const resp = new Response(text, { status, headers: h });

    if (status === 200 && cache) {
      try { await cache.put(cacheReq, resp.clone()); } catch {}
    }
    return resp;
  }

    if (url.pathname === "/api/pinpoint/today") {
      const date = url.searchParams.get("d") ?? getBeijingTodayDate();
      const today = getBeijingTodayDate();
      const body = await env.PP_DATA.get(keyOf(date));
      if (!body) {
        return new Response("not ready", { status: date === today ? 503 : 404 });
      }
      return new Response(body, { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/admin/seed" && url.hostname.endsWith(".workers.dev")) {
      const adminSecret = getAdminSecret(env);
      if (!adminSecret) return new Response("admin secret not configured", { status: 503 });
      const secret = url.searchParams.get("secret");
      if (secret !== adminSecret) return new Response("unauthorized", { status: 401 });

      const date = url.searchParams.get("date") ?? getBeijingTodayDate();
      const doc: Doc = {
        version: 1,
        puzzleDate: date,
        answers: [{ rank: 1, word: "MOCK" }, { rank: 2, word: "DATA" }],
        source: "graphql",
        fetchedAt: new Date().toISOString(),
        checksum: "sha256:demo",
        theme: "Demo Theme",
        mainAnswer: "Demo Theme",
      };
      const s = JSON.stringify(doc);
      await env.PP_DATA.put(keyOf(date), s, { expirationTtl: 60 * 60 * 24 * 400 });
      await env.PP_DATA.put("pinpoint:last", s, { expirationTtl: 60 * 60 * 24 * 400 });
      return new Response("seeded");
    }

    if (url.pathname === "/admin/preflight-linkedin") {
      const adminSecret = getAdminSecret(env);
      if (!adminSecret) return new Response("admin secret not configured", { status: 503 });
      const secret = url.searchParams.get("secret");
      if (secret !== adminSecret) return new Response("unauthorized", { status: 401 });

      const requestedDate = String(url.searchParams.get("date") || "").trim();
      const today = getBeijingTodayDate();
      const probeDate = requestedDate || addUtcDays(today, -1);
      const startedAt = Date.now();

      try {
        const doc = await fetchGraphQLFor(env, probeDate);
        const words = doc.answers
          .map((item) => String(item?.word || "").trim())
          .filter((item) => item.length > 0)
          .slice(0, 5);

        return new Response(JSON.stringify({
          ok: true,
          probeDate,
          source: doc.source,
          answersCount: words.length,
          words,
          theme: doc.theme || null,
          mainAnswer: doc.mainAnswer || doc.theme || null,
          checkedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        }), {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({
          ok: false,
          probeDate,
          error: message,
          checkedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
    }

    if (url.pathname === "/admin/test-fallback") {
      const adminSecret = getAdminSecret(env);
      if (!adminSecret) return new Response("admin secret not configured", { status: 503 });
      const secret = url.searchParams.get("secret");
      if (secret !== adminSecret) return new Response("unauthorized", { status: 401 });

      const requestedDate = String(url.searchParams.get("date") || "").trim();
      const probeDate = requestedDate || getBeijingTodayDate();
      const mode = normalizeFallbackMode(url.searchParams.get("mode"));
      const shouldNotify = envFlag(url.searchParams.get("notify") || undefined, false);
      const canNotify = hasNotifyWebhook(env);
      const startedAt = Date.now();

      try {
        const doc = await callPlaywrightFallback(env, probeDate, mode);
        const words = doc.answers
          .map((item) => String(item?.word || "").trim())
          .filter((item) => item.length > 0)
          .slice(0, 5);
        const durationMs = Date.now() - startedAt;
        const notified = shouldNotify && canNotify;

        if (notified) {
          await notifyCron(env, `✅ Worker ${getFallbackModeLabel(mode)}正常`, [
            `日期: ${probeDate}`,
            `模式: ${mode}`,
            `实际来源: ${getFallbackSourceLabel(doc.source)}`,
            `主题: ${doc.mainAnswer || doc.theme || "（空）"}`,
            `答案: ${words.join(" | ") || "（空）"}`,
            `耗时(ms): ${durationMs}`,
          ]);
        }

        return new Response(JSON.stringify({
          ok: true,
          probeDate,
          mode,
          source: doc.source,
          answersCount: words.length,
          words,
          theme: doc.theme || null,
          mainAnswer: doc.mainAnswer || doc.theme || null,
          checkedAt: new Date().toISOString(),
          durationMs,
          notifyRequested: shouldNotify,
          notified,
          ...(shouldNotify && !canNotify ? { notifySkipped: "no webhook configured" } : {}),
        }), {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const durationMs = Date.now() - startedAt;
        const notified = shouldNotify && canNotify;

        if (notified) {
          await notifyCron(env, `❌ Worker ${getFallbackModeLabel(mode)}异常`, [
            `日期: ${probeDate}`,
            `模式: ${mode}`,
            `错误: ${message}`,
            `耗时(ms): ${durationMs}`,
          ]);
        }

        return new Response(JSON.stringify({
          ok: false,
          probeDate,
          mode,
          error: message,
          checkedAt: new Date().toISOString(),
          durationMs,
          notifyRequested: shouldNotify,
          notified,
          ...(shouldNotify && !canNotify ? { notifySkipped: "no webhook configured" } : {}),
        }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
    }

    if (url.pathname === "/admin/run") {
      const adminSecret = getAdminSecret(env);
      if (!adminSecret) return new Response("admin secret not configured", { status: 503 });
      const secret = url.searchParams.get("secret");
      if (secret !== adminSecret) return new Response("unauthorized", { status: 401 });

      const date = url.searchParams.get("date") ?? getBeijingTodayDate();
      const publishEnabled = url.searchParams.get("publish") === "1";
      const forcePublish = url.searchParams.get("force") === "1";
      const requestedSource = String(url.searchParams.get("source") || "").trim().toLowerCase();
      const useStoredDoc = requestedSource === "stored";
      const autoI18nEnabled = resolveAutoI18nEnabled("manual", url.searchParams.get("i18n"));
      const requestId =
        req.headers.get("cf-ray") ||
        req.headers.get("x-request-id") ||
        req.headers.get("x-correlation-id") ||
        crypto.randomUUID();
      const runStartedAt = Date.now();
      const manualHeartbeat = buildCronHeartbeat(date, {
        source: "worker-admin-run",
        triggerKind: "manual",
        publishEnabled,
        forcePublish,
        requestId,
      });
      manualHeartbeat.triggerSeen = true;
      await persistCronHeartbeat(env, manualHeartbeat);
      try {
        let doc: Doc;
        if (useStoredDoc) {
          if (!canUseStoredAdminDoc(env)) {
            return new Response("stored source unavailable on primary branch", { status: 409 });
          }
          const storedDoc = await loadStoredDocForDate(env, date);
          if (!storedDoc) {
            return new Response("stored doc not found", { status: 404 });
          }
          doc = storedDoc;
        } else {
          try {
            doc = await fetchGraphQLFor(env, date);
          } catch (e) {

            if (env.FALLBACK_WEBHOOK) {
              doc = await callPlaywrightFallback(env, date);
            } else {
              throw e;
            }
          }
        }
        const result: JsonRecord = {
          stored: false,
          date,
          source: doc.source,
          publishEnabled,
          forcePublish,
          autoI18nEnabled,
          ...(useStoredDoc ? { docSourceMode: "stored" } : {}),
        };

        if (publishEnabled && !forcePublish) {
          const staleCheck = await isLikelyStaleCandidate(env, date, doc);
          if (staleCheck.stale) {
            const staleReason = staleCheck.reason || "same answers as yesterday";
            result.stale = true;
            result.staleComparedDate = staleCheck.comparedDate || "";
            result.staleReason = staleReason;
            result.quick = { status: "skipped", reason: `stale candidate: ${staleReason}` };
            result.enrich = { status: "skipped", reason: "stale candidate" };
            result.i18n = {
              status: "skipped",
              reason: "stale candidate",
              results: [],
            };
            manualHeartbeat.quickPublish = stampHeartbeatStage(manualHeartbeat.quickPublish, "skipped", `stale candidate: ${staleReason}`);
            manualHeartbeat.enrich = stampHeartbeatStage(manualHeartbeat.enrich, "skipped", "stale candidate");
            manualHeartbeat.i18n = stampHeartbeatStage(manualHeartbeat.i18n, "skipped", "stale candidate");
            manualHeartbeat.outcome = "stale_skipped";
            manualHeartbeat.durationMs = Date.now() - runStartedAt;
            manualHeartbeat.endedAt = new Date().toISOString();
            await persistCronHeartbeat(env, manualHeartbeat);
            return new Response(JSON.stringify(result), {
              headers: { "content-type": "application/json; charset=utf-8" },
            });
          }
        }

        const s = JSON.stringify(doc);
        await env.PP_DATA.put(keyOf(date), s);
        await env.PP_DATA.put("pinpoint:last", s);
        result.stored = true;

        if (publishEnabled) {
          const legacySiteBaseUrl = getLegacySiteBaseUrl(env);
          const puzzleNumber = inferPuzzleNumber((doc as unknown as { puzzleNumber?: unknown }).puzzleNumber, date);
          let quickResult = await quickPublishToSite(env, date, doc);
          const quickFallback = await maybeRefreshNewSiteLiveFallback(env, date, doc, quickResult.reason);
          const usedQuickFallback = quickFallback.applied;
          const reusedQuickFallback = Boolean(quickFallback.alreadyDone);
          if (usedQuickFallback) {
            quickResult = {
              status: "published",
              puzzleNumber: quickFallback.puzzleNumber,
              reason: `new-site live refresh fallback: ${quickResult.reason || "unknown"}`,
            };
            result.quickDetailUrl = quickFallback.detailUrl;
          } else if (reusedQuickFallback) {
            quickResult = {
              status: "skipped",
              puzzleNumber: quickFallback.puzzleNumber,
              reason: "quick publish already done today",
            };
            result.quickDetailUrl = quickFallback.detailUrl;
          }
          result.quick = quickResult;
          manualHeartbeat.quickPublish = stampHeartbeatStage(
            manualHeartbeat.quickPublish,
            quickResult.status === "published" ? "published" : "skipped",
            quickResult.reason,
          );
          await persistCronHeartbeat(env, manualHeartbeat);

          const shouldRunEnrich =
            quickResult.status === "published" ||
            isQuickPublishNonBlockingReason(quickResult.reason);

          if (shouldRunEnrich) {
            manualHeartbeat.enrich = stampHeartbeatStage(manualHeartbeat.enrich, "queued", "manual run queued enrich");
            manualHeartbeat.i18n = autoI18nEnabled
              ? stampHeartbeatStage(manualHeartbeat.i18n, "queued", "pending enrich")
              : stampHeartbeatStage(manualHeartbeat.i18n, "skipped", "auto i18n disabled for this run");
            await persistCronHeartbeat(env, manualHeartbeat);
            const enrichResult = await enrichPublishToSite(env, date, doc, {
              onDetailStateChange: async (detailState, reason) => {
                manualHeartbeat.enrich = stampHeartbeatDetailState(
                  manualHeartbeat.enrich,
                  detailState,
                  reason,
                );
                manualHeartbeat.enrich = stampHeartbeatStage(
                  manualHeartbeat.enrich,
                  getHeartbeatStageStatusForDetailState(detailState),
                  reason,
                );
                await persistCronHeartbeat(env, manualHeartbeat);
              },
            });
            result.enrich = enrichResult;
            manualHeartbeat.enrich = stampHeartbeatStage(
              manualHeartbeat.enrich,
              isSuccessfulEnrichResult(enrichResult) ? "published" : "skipped",
              enrichResult.reason,
            );
            await persistCronHeartbeat(env, manualHeartbeat);

            // Publish to new site (non-blocking, failures don't affect old site)
            if (isSuccessfulEnrichResult(enrichResult)) {
              try {
                await publishToNewSiteGitHub(env, date, doc, enrichResult.payload, puzzleNumber);
              } catch (newSiteErr) {
                console.warn("[new-site] publish failed (non-fatal):", newSiteErr);
              }
            }

            let payloadForI18n = enrichResult.payload ?? null;
            if (
              !payloadForI18n &&
              enrichResult.status === "skipped" &&
              enrichResult.reason === "enrich already done today" &&
              legacySiteBaseUrl
            ) {
              const backfillTimeoutMs = parseTimeoutMs(env.AUTO_I18N_TIMEOUT_MS, 90_000);
              payloadForI18n = await loadEnrichedPayloadFromSite(legacySiteBaseUrl, puzzleNumber, backfillTimeoutMs);
              if (payloadForI18n) {
                result.i18nBackfill = "loaded existing EN payload";
              }
            }

            const enrichFallback =
              !payloadForI18n
                ? await maybeRefreshNewSiteLiveFallback(env, date, doc, enrichResult.reason)
                : { applied: false };
            if (enrichFallback.applied) {
              result.newSiteFallback = {
                applied: true,
                detailUrl: enrichFallback.detailUrl,
                reason: enrichResult.reason || "legacy site pipeline unavailable",
              };
            }

            if (!autoI18nEnabled) {
              result.i18n = {
                status: "skipped",
                reason: "auto i18n disabled for this run",
                results: [],
              };
              await persistCronHeartbeat(env, manualHeartbeat);
            } else if (payloadForI18n) {
              const i18nResult = await localizePublishToSite(env, date, doc, payloadForI18n, {
                enabled: autoI18nEnabled,
              });
              result.i18n = i18nResult;
              if (i18nResult.status === "skipped") {
                manualHeartbeat.i18n = stampHeartbeatStage(manualHeartbeat.i18n, "skipped", i18nResult.reason || "not enabled");
              } else {
                const published = i18nResult.results.filter((item) => item.status === "published");
                const failed = i18nResult.results.filter((item) => item.status === "failed");
                const skipped = i18nResult.results.filter((item) => item.status === "skipped");
                manualHeartbeat.i18n = {
                  ...stampHeartbeatStage(
                    manualHeartbeat.i18n,
                    failed.length > 0 ? "failed" : published.length > 0 ? "published" : "skipped",
                    failed.length > 0 ? `${failed.length} locale failed` : undefined,
                  ),
                  publishedCount: published.length,
                  failedCount: failed.length,
                  skippedCount: skipped.length,
                };
              }
              await persistCronHeartbeat(env, manualHeartbeat);
            } else {
              result.i18n = {
                status: "skipped",
                reason:
                  (enrichFallback.applied
                    ? `new-site live refresh fallback: ${enrichResult.reason || "unknown"}`
                    : enrichResult.reason) || "enrich payload missing",
                results: [],
              };
              manualHeartbeat.i18n = stampHeartbeatStage(
                manualHeartbeat.i18n,
                "skipped",
                (enrichFallback.applied
                  ? `new-site live refresh fallback: ${enrichResult.reason || "unknown"}`
                  : enrichResult.reason) || "enrich payload missing",
              );
              await persistCronHeartbeat(env, manualHeartbeat);
            }
          } else {
            const fallbackReason = quickResult.reason || "quick publish not ready";
            const directFallback = await maybeRefreshNewSiteLiveFallback(env, date, doc, fallbackReason);
            const skipReason = directFallback.applied
              ? `new-site live refresh fallback: ${fallbackReason}`
              : fallbackReason;
            if (directFallback.applied) {
              result.quick = {
                status: "published",
                puzzleNumber: directFallback.puzzleNumber,
                reason: skipReason,
              };
              result.quickDetailUrl = directFallback.detailUrl;
              manualHeartbeat.quickPublish = stampHeartbeatStage(
                manualHeartbeat.quickPublish,
                "published",
                skipReason,
              );
            }
            result.enrich = { status: "skipped", reason: skipReason };
            result.i18n = {
              status: "skipped",
              reason: skipReason,
              results: [],
            };
            manualHeartbeat.enrich = stampHeartbeatStage(manualHeartbeat.enrich, "skipped", skipReason);
            manualHeartbeat.i18n = stampHeartbeatStage(manualHeartbeat.i18n, "skipped", skipReason);
            await persistCronHeartbeat(env, manualHeartbeat);
          }
        } else {
          manualHeartbeat.quickPublish = stampHeartbeatStage(manualHeartbeat.quickPublish, "skipped", "publish disabled");
          manualHeartbeat.enrich = stampHeartbeatStage(manualHeartbeat.enrich, "skipped", "publish disabled");
          manualHeartbeat.i18n = stampHeartbeatStage(manualHeartbeat.i18n, "skipped", "publish disabled");
          await persistCronHeartbeat(env, manualHeartbeat);
        }

        manualHeartbeat.outcome = "succeeded";
        manualHeartbeat.durationMs = Date.now() - runStartedAt;
        manualHeartbeat.endedAt = new Date().toISOString();
        await persistCronHeartbeat(env, manualHeartbeat);
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        manualHeartbeat.outcome = "failed";
        manualHeartbeat.error = message;
        manualHeartbeat.durationMs = Date.now() - runStartedAt;
        manualHeartbeat.endedAt = new Date().toISOString();
        await persistCronHeartbeat(env, manualHeartbeat);
        return new Response(`error: ${message}`, { status: 500 });
      }
    }

    if (url.pathname === "/admin/put-doc" && req.method === "POST") {
      const enabled = env.ADMIN_PUT_DOC_ENABLED === 'true';
      const isProd = (env.ENVIRONMENT || '').toLowerCase() === 'production';
      if (isProd || !enabled) {

        return new Response("Not Found", { status: 404 });
      }

      const expectedSecret = getAdminPutDocSecret(env);
      if (!expectedSecret) {
        return new Response(!isProd ? "admin secret not configured" : "Not Found", {
          status: !isProd ? 503 : 404,
        });
      }
      const secret = url.searchParams.get("secret");
      if (secret !== expectedSecret) {

        return new Response("Not Found", { status: 404 });
      }

      const ct = req.headers.get('content-type') || '';
      const isJson = ct.toLowerCase().startsWith('application/json');
      if (!isJson) {
        return new Response('Bad Request: JSON required', { status: 400 });
      }
      const clHeader = req.headers.get('content-length');
      const maxBytes = 32 * 1024; // 32KB
      if (clHeader) {
        const cl = Number(clHeader);
        if (!Number.isFinite(cl) || cl > maxBytes) {
          return new Response('Bad Request: payload too large', { status: 400 });
        }
      }

      const ip = req.headers.get('cf-connecting-ip')
        || req.headers.get('x-forwarded-for')
        || req.headers.get('x-real-ip')
        || 'unknown';
      const routeKey = 'put-doc';
      const devMode = !isProd;
      const perMin = Math.max(
        Number(env.PUT_DOC_RATE_PER_MIN ?? (devMode ? '60' : '10')) || (devMode ? 60 : 10),
        1
      );
      const perDay = Math.max(
        Number(env.PUT_DOC_RATE_PER_DAY ?? (devMode ? '1000' : '100')) || (devMode ? 1000 : 100),
        1
      );
      async function checkAndInc(key: string, ttl: number, limit: number): Promise<{ allowed: boolean; count: number; }> {
        const raw = await env.PP_DATA.get(key);
        const count = raw ? Number(raw) || 0 : 0;
        if (count >= limit) return { allowed: false, count };
        const next = String(count + 1);
        await env.PP_DATA.put(key, next, { expirationTtl: ttl });
        return { allowed: true, count: count + 1 };
      }
      const minKey = `rl:${routeKey}:min:${ip}`;
      const dayKey = `rl:${routeKey}:day:${ip}`;
      const dayRes = await checkAndInc(dayKey, 86400, perDay);
      if (!dayRes.allowed) {

        return new Response(devMode ? 'Too Many Requests (daily)' : 'Not Found', { status: devMode ? 429 : 404 });
      }
      const minRes = await checkAndInc(minKey, 60, perMin);
      if (!minRes.allowed) {
        return new Response(devMode ? 'Too Many Requests (minute)' : 'Not Found', { status: devMode ? 429 : 404 });
      }

      try {
        const raw = await req.text();

        const rawBytes = new TextEncoder().encode(raw).length;
        if (rawBytes > maxBytes) {
          return new Response('Bad Request: payload too large', { status: 400 });
        }

        let payload: PutDocPayload | null;
        try {
          payload = asRecord(JSON.parse(raw)) as PutDocPayload | null;
        } catch {
          return new Response('Bad Request: invalid JSON', { status: 400 });
        }
        if (!payload) {
          return new Response('Bad Request: invalid structure', { status: 400 });
        }

        const allowedKeys = ['theme', 'mainAnswer', 'answers'];
        const keys = Object.keys(payload || {});
        const extra = keys.filter(k => !allowedKeys.includes(k));
        const missing = allowedKeys.filter(k => !keys.includes(k));
        if (extra.length > 0 || missing.length > 0) {
          return new Response('Bad Request: invalid structure', { status: 400 });
        }

        const theme = typeof payload.theme === 'string' ? payload.theme.trim() : '';
        const mainAnswer = typeof payload.mainAnswer === 'string' ? payload.mainAnswer.trim() : '';
        const answersArray = Array.isArray(payload.answers) ? payload.answers : [];
        const validTheme = theme.length > 0 && theme.length <= 100;
        const validMain = mainAnswer.length > 0 && mainAnswer.length <= 200;
        const validAnswersLen = answersArray.length === 5;
        const validAnswersItems =
          validAnswersLen &&
          answersArray.every((x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= 100);
        if (!validTheme || !validMain || !validAnswersItems) {
          return new Response('Bad Request: field validation failed', { status: 400 });
        }

        const date = getBeijingTodayDate();
        const answers: Answer[] = answersArray.map((w: string, i: number) => ({ rank: i + 1, word: w.trim() }));
        const checksum = `sha256:${await sha256Hex(JSON.stringify(answers))}`;
        const s = JSON.stringify({
          version: 1,
          puzzleDate: date,
          answers,
          source: "fallback-webhook",
          fetchedAt: new Date().toISOString(),
          checksum,
          theme,
          mainAnswer,
        } satisfies Doc);
        await env.PP_DATA.put(keyOf(date), s);
        await env.PP_DATA.put("pinpoint:last", s);
        return new Response("stored");
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return new Response(devMode ? `error: ${message}` : 'Not Found', { status: devMode ? 500 : 404 });
      }
    }

    if (url.pathname === "/admin/upload-ops" && req.method === "POST") {
      const adminSecret = getAdminSecret(env);
      if (!adminSecret) return new Response("admin secret not configured", { status: 503 });
      const secret = url.searchParams.get("secret");
      if (secret !== adminSecret) return new Response("unauthorized", { status: 401 });

      try {
        const body = await req.text();
        const opsData = JSON.parse(body);

        if (!opsData.operations || !Array.isArray(opsData.operations)) {
          return new Response("Invalid operations format", { status: 400 });
        }

        await env.PP_DATA.put("gql:pinpoint:ops", body);

        return new Response(`uploaded ${opsData.operations.length} operations`);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return new Response(`error: ${message}`, { status: 500 });
      }
    }

    if (url.pathname === "/health") {
      const raw = await env.PP_DATA.get("pinpoint:last");
      return new Response(raw ?? "{}", { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/monitor/cron-status") {
      const date = String(url.searchParams.get("date") || "").trim();
      const limitRaw = Number.parseInt(String(url.searchParams.get("limit") || "10"), 10);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, cronHeartbeatRunsLimit)) : 10;
      const now = new Date().toISOString();
      const latestRaw = await env.PP_DATA.get(cronHeartbeatLatestKey);
      let latest: CronHeartbeat | null = null;
      try { latest = latestRaw ? JSON.parse(latestRaw) as CronHeartbeat : null; } catch {}

      const effectiveDate = date || latest?.date || "";
      const dateRaw = effectiveDate ? await env.PP_DATA.get(cronHeartbeatDayKeyOf(effectiveDate)) : null;
      let byDate: CronHeartbeat | null = null;
      try { byDate = dateRaw ? JSON.parse(dateRaw) as CronHeartbeat : null; } catch {}

      const runs = effectiveDate ? await loadCronHeartbeatRuns(env, effectiveDate, limit) : [];
      const alerts = buildCronHeartbeatAlerts(byDate ?? latest, Date.parse(now));
      return new Response(JSON.stringify({
        now,
        date: date || null,
        effectiveDate: effectiveDate || null,
        latest,
        byDate,
        runs,
        alerts,
      }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const scheduledAt =
      typeof controller.scheduledTime === "number" ? new Date(controller.scheduledTime) : new Date();
    const date = getBeijingTodayDate(scheduledAt);
    const expectedUtcHour = getPinpointUnlockUtcHour(date);
    const scheduledUtcHour = scheduledAt.getUTCHours();

    if (scheduledUtcHour !== expectedUtcHour) {
      console.log("scheduled run skipped outside active unlock window", {
        date,
        scheduledAt: scheduledAt.toISOString(),
        scheduledUtcHour,
        expectedUtcHour,
        cron: controller.cron,
      });
      return;
    }

    const startedAt = Date.now();
    const publicSiteBaseUrl = getPublicSiteBaseUrl(env);
    const legacySiteBaseUrl = getLegacySiteBaseUrl(env);
    const autoI18nEnabled = resolveAutoI18nEnabled("scheduled", null);
    let failureContext = "";
    const heartbeat = buildCronHeartbeat(date, {
      source: "worker-scheduled",
      triggerKind: "scheduled",
      publishEnabled: true,
      forcePublish: false,
    });
    await persistCronHeartbeat(env, heartbeat);
    try {
      let doc: Doc;
      try {
        doc = await fetchGraphQLFor(env, date);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("graphql path failed", msg);
        if (env.FALLBACK_WEBHOOK) {
          try {
            doc = await callPlaywrightFallback(env, date);
          } catch (fe) {
            if (fe instanceof FallbackNotReadyError) {
              const durationMs = Date.now() - startedAt;
              const reason = fe.retryAfterSec ? `fallback not ready (retry-after ${fe.retryAfterSec}s)` : "fallback not ready";
              heartbeat.triggerSeen = true;
              heartbeat.quickPublish = stampHeartbeatStage(heartbeat.quickPublish, "skipped", reason);
              heartbeat.enrich = stampHeartbeatStage(heartbeat.enrich, "skipped", reason);
              heartbeat.i18n = stampHeartbeatStage(heartbeat.i18n, "skipped", reason);
              heartbeat.outcome = "not_ready";
              heartbeat.durationMs = durationMs;
              heartbeat.endedAt = new Date().toISOString();
              await persistCronHeartbeat(env, heartbeat);
              console.warn("fallback not ready; skipping cron run", { date, retryAfterSec: fe.retryAfterSec });
              return;
            }
            const fmsg = fe instanceof Error ? fe.message : String(fe);
            console.error("fallback path failed", fmsg);
            throw fe;
          }
        } else {
          throw e;
        }
      }

      const staleCheck = await isLikelyStaleCandidate(env, date, doc);
      if (staleCheck.stale) {
        const durationMs = Date.now() - startedAt;
        const words = doc.answers.map((a) => a.word).slice(0, 5).join(" | ");
        heartbeat.triggerSeen = true;
        heartbeat.quickPublish = stampHeartbeatStage(heartbeat.quickPublish, "skipped", "stale candidate");
        heartbeat.enrich = stampHeartbeatStage(heartbeat.enrich, "skipped", "stale candidate");
        heartbeat.i18n = stampHeartbeatStage(heartbeat.i18n, "skipped", "stale candidate");
        heartbeat.outcome = "stale_skipped";
        heartbeat.durationMs = durationMs;
        heartbeat.endedAt = new Date().toISOString();
        await persistCronHeartbeat(env, heartbeat);
        await notifyCron(env, "⚠️ Worker 定时抓取到疑似旧数据（已跳过发布）", [
          `日期: ${date}`,
          `来源: ${doc.source}`,
          `主题: ${doc.mainAnswer || doc.theme || "（空）"}`,
          `答案: ${words}`,
          `对比日期: ${staleCheck.comparedDate || "未知"}`,
          `原因: ${toZhWebhookReason(staleCheck.reason || "same as yesterday")}`,
          `耗时(ms): ${durationMs}`,
        ]);
        return;
      }

      const s = JSON.stringify(doc);
      await env.PP_DATA.put(keyOf(date), s, { expirationTtl: 60 * 60 * 24 * 400 }); // ~400 天 TTL
      await env.PP_DATA.put("pinpoint:last", s, { expirationTtl: 60 * 60 * 24 * 400 });
      heartbeat.triggerSeen = true;
      await persistCronHeartbeat(env, heartbeat);
      const durationMs = Date.now() - startedAt;
      const words = doc.answers.map((a) => a.word).slice(0, 5).join(" | ");
      const notifyLines = [
        `日期: ${date}`,
        `来源: ${doc.source}`,
        `主题: ${doc.mainAnswer || doc.theme || "（空）"}`,
        `答案: ${words}`,
      ];
      let publishBlockingIssue = "";

      try {
        const quickStarted = Date.now();
        let quickResult = await quickPublishToSite(env, date, doc);
        const quickDuration = Date.now() - quickStarted;
        const quickFallback = await maybeRefreshNewSiteLiveFallback(env, date, doc, quickResult.reason);
        const usedQuickFallback = quickFallback.applied;
        const reusedQuickFallback = Boolean(quickFallback.alreadyDone);
        if (usedQuickFallback) {
          quickResult = {
            status: "published",
            puzzleNumber: quickFallback.puzzleNumber,
            reason: `new-site live refresh fallback: ${quickResult.reason || "unknown"}`,
          };
        } else if (reusedQuickFallback) {
          quickResult = {
            status: "skipped",
            puzzleNumber: quickFallback.puzzleNumber,
            reason: "quick publish already done today",
          };
        }
        if (quickResult.status === "published") {
          const puzzleNumber = quickResult.puzzleNumber ?? inferPuzzleNumber(undefined, date);
          const detailUrl = quickFallback.detailUrl || `${publicSiteBaseUrl}/linkedin-pinpoint-answers/pinpoint-answer-${puzzleNumber}/`;
          notifyLines.push(
            usedQuickFallback
              ? `快速发布: 已刷新新站实时页 #${puzzleNumber} (${quickDuration}ms)`
              : `快速发布: 已发布 #${puzzleNumber} (${quickDuration}ms)`,
          );
          notifyLines.push(`详情: ${detailUrl}`);
          heartbeat.quickPublish = stampHeartbeatStage(heartbeat.quickPublish, "published", quickResult.reason);
        } else {
          if (reusedQuickFallback && quickFallback.detailUrl) {
            notifyLines.push(`快速发布: 今日已存在新站实时页 #${quickFallback.puzzleNumber ?? inferPuzzleNumber(undefined, date)} (${quickDuration}ms)`);
            notifyLines.push(`详情: ${quickFallback.detailUrl}`);
          } else {
            notifyLines.push(`快速发布: 跳过 (${toZhWebhookReason(quickResult.reason || "no reason")}, ${quickDuration}ms)`);
          }
          heartbeat.quickPublish = stampHeartbeatStage(
            heartbeat.quickPublish,
            "skipped",
            quickResult.reason || "not published",
          );
          const reason = String(quickResult.reason || "");
          if (
            !isQuickPublishNonBlockingReason(reason) &&
            reason !== "enrich already done today" &&
            reason !== "enrich already running"
          ) {
            publishBlockingIssue = reason || "unknown skip reason";
          }
        }
        await persistCronHeartbeat(env, heartbeat);

        const shouldQueueEnrich =
          quickResult.status === "published" ||
          isQuickPublishNonBlockingReason(quickResult.reason);

        if (shouldQueueEnrich) {
          const puzzleNumber = quickResult.puzzleNumber ?? inferPuzzleNumber(undefined, date);
          const detailUrl = `${publicSiteBaseUrl}/linkedin-pinpoint-answers/pinpoint-answer-${puzzleNumber}/`;
          heartbeat.enrich = stampHeartbeatStage(heartbeat.enrich, "queued", `queued #${puzzleNumber}`);
          heartbeat.i18n = autoI18nEnabled
            ? stampHeartbeatStage(heartbeat.i18n, "queued", `pending enrich #${puzzleNumber}`)
            : stampHeartbeatStage(heartbeat.i18n, "skipped", "auto i18n disabled for this run");
          await persistCronHeartbeat(env, heartbeat);
          ctx.waitUntil(
            (async () => {
              const enrichStarted = Date.now();
              try {
                const enrichResult = await enrichPublishToSite(env, date, doc, {
                  onDetailStateChange: async (detailState, reason) => {
                    heartbeat.enrich = stampHeartbeatDetailState(
                      heartbeat.enrich,
                      detailState,
                      reason,
                    );
                    heartbeat.enrich = stampHeartbeatStage(
                      heartbeat.enrich,
                      getHeartbeatStageStatusForDetailState(detailState),
                      reason,
                    );
                    await persistCronHeartbeat(env, heartbeat);
                  },
                });
                let payloadForI18n = enrichResult.payload ?? null;
                if (isSuccessfulEnrichResult(enrichResult)) {
                  heartbeat.enrich = stampHeartbeatStage(heartbeat.enrich, "published");
                  await persistCronHeartbeat(env, heartbeat);
                  try {
                    await publishToNewSiteGitHub(env, date, doc, enrichResult.payload, puzzleNumber);
                  } catch (newSiteErr) {
                    console.warn("[new-site] publish failed (non-fatal):", newSiteErr);
                  }
                } else {
                  heartbeat.enrich = stampHeartbeatStage(
                    heartbeat.enrich,
                    "skipped",
                    enrichResult.reason || "not needed",
                  );
                  await persistCronHeartbeat(env, heartbeat);
                }

                if (
                  !payloadForI18n &&
                  enrichResult.status === "skipped" &&
                  enrichResult.reason === "enrich already done today" &&
                  legacySiteBaseUrl
                ) {
                  const backfillTimeoutMs = parseTimeoutMs(env.AUTO_I18N_TIMEOUT_MS, 90_000);
                  payloadForI18n = await loadEnrichedPayloadFromSite(legacySiteBaseUrl, puzzleNumber, backfillTimeoutMs);
                }

                const enrichFallback =
                  !payloadForI18n
                    ? await maybeRefreshNewSiteLiveFallback(env, date, doc, enrichResult.reason)
                    : { applied: false };
                if (enrichFallback.applied) {
                  await notifyCron(env, "⚠️ Worker 已改走新站实时刷新兜底", [
                    `日期: ${date}`,
                    `谜题: #${enrichFallback.puzzleNumber ?? puzzleNumber}`,
                    `详情: ${enrichFallback.detailUrl || detailUrl}`,
                    `原因: ${toZhWebhookReason(enrichResult.reason || "legacy site pipeline unavailable")}`,
                  ]);
                }

                if (!autoI18nEnabled) {
                  await persistCronHeartbeat(env, heartbeat);
                } else if (payloadForI18n) {
                  const i18nStarted = Date.now();
                  const i18nResult = await localizePublishToSite(env, date, doc, payloadForI18n, {
                    enabled: autoI18nEnabled,
                  });
                  if (i18nResult.status === "skipped") {
                    heartbeat.i18n = stampHeartbeatStage(heartbeat.i18n, "skipped", i18nResult.reason || "not enabled");
                    await persistCronHeartbeat(env, heartbeat);
                  } else {
                    const i18nDuration = Date.now() - i18nStarted;
                    const published = i18nResult.results.filter((item) => item.status === "published");
                    const failed = i18nResult.results.filter((item) => item.status === "failed");
                    const skipped = i18nResult.results.filter((item) => item.status === "skipped");
                    heartbeat.i18n = {
                      ...stampHeartbeatStage(
                        heartbeat.i18n,
                        failed.length > 0 ? "failed" : published.length > 0 ? "published" : "skipped",
                        failed.length > 0 ? `${failed.length} locale failed` : undefined,
                      ),
                      publishedCount: published.length,
                      failedCount: failed.length,
                      skippedCount: skipped.length,
                    };
                    await persistCronHeartbeat(env, heartbeat);
                    if (failed.length > 0) {
                      await notifyCron(env, "⚠️ Worker 异步多语言完成（有失败）", [
                        `日期: ${date}`,
                        `谜题: #${puzzleNumber}`,
                        `已发布: ${published.length}`,
                        `失败: ${failed.length}`,
                        `跳过: ${skipped.length}`,
                        ...failed.map((item) => `${item.locale}: 失败 (${toZhWebhookReason(item.reason || "unknown error")})`),
                        `耗时(ms): ${i18nDuration}`,
                      ]);
                    }
                  }
                } else {
                  heartbeat.i18n = stampHeartbeatStage(
                    heartbeat.i18n,
                    "skipped",
                    (enrichFallback.applied
                      ? `new-site live refresh fallback: ${enrichResult.reason || "unknown"}`
                      : enrichResult.reason) || "enrich payload missing",
                  );
                  await persistCronHeartbeat(env, heartbeat);
                }
              } catch (enrichError) {
                const enrichMsg = enrichError instanceof Error ? enrichError.message : String(enrichError);
                const enrichDuration = Date.now() - enrichStarted;
                const directFallback = await maybeRefreshNewSiteLiveFallback(env, date, doc, enrichMsg);
                if (directFallback.applied) {
                  heartbeat.enrich = stampHeartbeatStage(
                    heartbeat.enrich,
                    "published",
                    `new-site live refresh fallback: ${enrichMsg}`,
                  );
                  heartbeat.i18n = stampHeartbeatStage(
                    heartbeat.i18n,
                    "skipped",
                    `new-site live refresh fallback: ${enrichMsg}`,
                  );
                  await persistCronHeartbeat(env, heartbeat);
                  await notifyCron(env, "⚠️ Worker 异步增强改走新站实时刷新兜底", [
                    `日期: ${date}`,
                    `谜题: #${directFallback.puzzleNumber ?? puzzleNumber}`,
                    `详情: ${directFallback.detailUrl || detailUrl}`,
                    `原因: ${toZhWebhookReason(enrichMsg)}`,
                    `耗时(ms): ${enrichDuration}`,
                  ]);
                } else {
                  heartbeat.enrich = stampHeartbeatStage(heartbeat.enrich, "failed", enrichMsg);
                  heartbeat.i18n = stampHeartbeatStage(heartbeat.i18n, "skipped", "enrich failed");
                  await persistCronHeartbeat(env, heartbeat);
                  await notifyCron(env, "❌ Worker 异步增强失败", [
                    `日期: ${date}`,
                    `谜题: #${puzzleNumber}`,
                    `详情: ${detailUrl}`,
                    `错误: ${enrichMsg}`,
                    `耗时(ms): ${enrichDuration}`,
                  ]);
                }
              }
            })(),
          );
          notifyLines.push(`增强: 已入队 #${puzzleNumber}`);
        } else {
          const reason = quickResult.reason || "quick publish not ready";
          const directFallback = await maybeRefreshNewSiteLiveFallback(env, date, doc, reason);
          const finalReason = directFallback.applied
            ? `new-site live refresh fallback: ${reason}`
            : reason;
          if (directFallback.applied) {
            notifyLines.push(`快速发布兜底: 新站实时刷新 #${directFallback.puzzleNumber ?? inferPuzzleNumber(undefined, date)}`);
            if (directFallback.detailUrl) {
              notifyLines.push(`详情: ${directFallback.detailUrl}`);
            }
            heartbeat.quickPublish = stampHeartbeatStage(heartbeat.quickPublish, "published", finalReason);
          }
          heartbeat.enrich = stampHeartbeatStage(heartbeat.enrich, "skipped", finalReason);
          heartbeat.i18n = stampHeartbeatStage(heartbeat.i18n, "skipped", finalReason);
          await persistCronHeartbeat(env, heartbeat);
        }
      } catch (publishError) {
        const publishMsg = publishError instanceof Error ? publishError.message : String(publishError);
        const directFallback = await maybeRefreshNewSiteLiveFallback(env, date, doc, publishMsg);
        if (directFallback.applied) {
          const puzzleNumber = directFallback.puzzleNumber ?? inferPuzzleNumber(undefined, date);
          console.warn("quick publish failed; used new-site live refresh fallback", publishMsg);
          notifyLines.push(`快速发布: 已刷新新站实时页 #${puzzleNumber}`);
          if (directFallback.detailUrl) {
            notifyLines.push(`详情: ${directFallback.detailUrl}`);
          }
          heartbeat.quickPublish = stampHeartbeatStage(
            heartbeat.quickPublish,
            "published",
            `new-site live refresh fallback: ${publishMsg}`,
          );
          heartbeat.enrich = stampHeartbeatStage(
            heartbeat.enrich,
            "skipped",
            `new-site live refresh fallback: ${publishMsg}`,
          );
          heartbeat.i18n = stampHeartbeatStage(
            heartbeat.i18n,
            "skipped",
            `new-site live refresh fallback: ${publishMsg}`,
          );
          await persistCronHeartbeat(env, heartbeat);
        } else {
          console.error("quick publish failed", publishMsg);
          notifyLines.push(`快速发布: 失败 (${publishMsg})`);
          heartbeat.quickPublish = stampHeartbeatStage(heartbeat.quickPublish, "failed", publishMsg);
          heartbeat.enrich = stampHeartbeatStage(heartbeat.enrich, "skipped", "quick publish failed");
          heartbeat.i18n = stampHeartbeatStage(heartbeat.i18n, "skipped", "quick publish failed");
          await persistCronHeartbeat(env, heartbeat);
          publishBlockingIssue = publishMsg;
        }
      }

      notifyLines.push(`健康检查: ${publicSiteBaseUrl}/api/health`);
      notifyLines.push(`今日接口: ${publicSiteBaseUrl}/api/pinpoint/today`);
      notifyLines.push(`耗时(ms): ${durationMs}`);
      if (publishBlockingIssue) {
        notifyLines.push(`发布阻塞: ${toZhWebhookReason(publishBlockingIssue)}`);
        failureContext = notifyLines.join(" | ");
        heartbeat.outcome = "failed";
        heartbeat.error = `publish pipeline blocked: ${publishBlockingIssue}`;
        heartbeat.durationMs = durationMs;
        heartbeat.endedAt = new Date().toISOString();
        await persistCronHeartbeat(env, heartbeat);
        throw new Error(`publish pipeline blocked: ${publishBlockingIssue}`);
      }
      heartbeat.outcome = "succeeded";
      heartbeat.durationMs = durationMs;
      heartbeat.endedAt = new Date().toISOString();
      await persistCronHeartbeat(env, heartbeat);
      const alreadyNotified = await checkAndMarkCronSuccessNotified(env, date);
      if (!alreadyNotified) {
        await notifyCron(env, "✅ Worker 定时抓取成功", [
          ...notifyLines,
        ]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("cron error", msg);
      const durationMs = Date.now() - startedAt;
      heartbeat.outcome = "failed";
      heartbeat.error = msg;
      heartbeat.durationMs = durationMs;
      heartbeat.endedAt = new Date().toISOString();
      await persistCronHeartbeat(env, heartbeat);
      const lines = [
        `日期: ${date}`,
        `错误: ${msg}`,
        `耗时(ms): ${durationMs}`,
      ];
      if (failureContext) {
        lines.push(`上下文: ${failureContext}`);
      }
      await notifyCron(env, "❌ Worker 定时抓取失败", lines);
    }
  },
} satisfies ExportedHandler<Env>;
