import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { feedbackWebhookSource, supportEmail } from "@/lib/site/config";

export const runtime = "nodejs";

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const feedbackRateLimitWindowMs = readPositiveIntegerEnv("FEEDBACK_RATE_LIMIT_WINDOW_MS", 10 * 60 * 1000);
const feedbackRateLimitMaxRequests = readPositiveIntegerEnv("FEEDBACK_RATE_LIMIT_MAX", 5);

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitStoreConfig = {
  token: string;
  url: string;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __feedbackRateLimitStore?: Map<string, RateLimitBucket>;
  __feedbackRateLimitFallbackWarned?: boolean;
};

const feedbackRateLimitStore =
  globalForRateLimit.__feedbackRateLimitStore
  ?? (globalForRateLimit.__feedbackRateLimitStore = new Map<string, RateLimitBucket>());

const feedbackSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).default(""),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().min(3).max(3000),
  website: z.string().trim().max(200).optional().default(""),
  puzzleNumber: z
    .union([z.number().int().positive(), z.string().trim(), z.undefined()])
    .transform((value) => {
      if (typeof value === "number") {
        return value;
      }
      if (typeof value === "string" && value) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return undefined;
    }),
});

function bad(status: number, message: string) {
  return NextResponse.json({ code: status, message }, { status });
}

function hasInvalidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin")?.trim();
  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin !== req.nextUrl.origin;
  } catch {
    return true;
  }
}

function getFeedbackRateLimitKey(req: NextRequest): string {
  const cfConnectingIp = req.headers.get("cf-connecting-ip")?.trim();
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  const userAgent = req.headers.get("user-agent")?.trim() || "unknown";
  return `${cfConnectingIp || forwardedFor || realIp || "unknown"}::${userAgent}`;
}

function getSharedRateLimitConfig(): RateLimitStoreConfig | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim()
    || process.env.KV_REST_API_URL?.trim()
    || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    || process.env.KV_REST_API_TOKEN?.trim()
    || "";

  if (!url || !token) {
    return null;
  }

  return {
    token,
    url: url.replace(/\/+$/, ""),
  };
}

function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function getRateLimitWindowResetAt(now: number): number {
  const windowStart = Math.floor(now / feedbackRateLimitWindowMs) * feedbackRateLimitWindowMs;
  return windowStart + feedbackRateLimitWindowMs;
}

function buildSharedRateLimitKey(rateLimitKey: string, now: number): string {
  const windowStart = Math.floor(now / feedbackRateLimitWindowMs) * feedbackRateLimitWindowMs;
  return `feedback-rate:${windowStart}:${hashRateLimitKey(rateLimitKey)}`;
}

function warnRateLimitFallback(error: unknown) {
  if (globalForRateLimit.__feedbackRateLimitFallbackWarned) {
    return;
  }

  globalForRateLimit.__feedbackRateLimitFallbackWarned = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`feedback.rate_limit.fallback_to_memory: ${message}`);
}

function getInMemoryRateLimitRetryAfter(req: NextRequest): number | null {
  const now = Date.now();

  for (const [key, bucket] of feedbackRateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      feedbackRateLimitStore.delete(key);
    }
  }

  const rateLimitKey = getFeedbackRateLimitKey(req);
  const currentBucket = feedbackRateLimitStore.get(rateLimitKey);
  if (!currentBucket) {
    feedbackRateLimitStore.set(rateLimitKey, {
      count: 1,
      resetAt: now + feedbackRateLimitWindowMs,
    });
    return null;
  }

  if (currentBucket.resetAt <= now) {
    feedbackRateLimitStore.set(rateLimitKey, {
      count: 1,
      resetAt: now + feedbackRateLimitWindowMs,
    });
    return null;
  }

  if (currentBucket.count >= feedbackRateLimitMaxRequests) {
    return Math.max(1, Math.ceil((currentBucket.resetAt - now) / 1000));
  }

  currentBucket.count += 1;
  feedbackRateLimitStore.set(rateLimitKey, currentBucket);
  return null;
}

async function getSharedRateLimitRetryAfter(
  req: NextRequest,
  config: RateLimitStoreConfig,
): Promise<number | null> {
  const now = Date.now();
  const rateLimitKey = getFeedbackRateLimitKey(req);
  const sharedKey = buildSharedRateLimitKey(rateLimitKey, now);
  const resetAt = getRateLimitWindowResetAt(now);
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", sharedKey],
      ["PEXPIRE", sharedKey, String(feedbackRateLimitWindowMs * 2)],
    ]),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`shared feedback rate limit failed with status ${response.status}`);
  }

  const payload = await response.json() as Array<{ error?: string; result?: number | string | null }>;
  const incrementResult = Array.isArray(payload) ? payload[0] : null;
  const count = Number(incrementResult?.result);

  if (incrementResult?.error || !Number.isFinite(count)) {
    throw new Error("shared feedback rate limit returned an invalid response");
  }

  if (count > feedbackRateLimitMaxRequests) {
    return Math.max(1, Math.ceil((resetAt - now) / 1000));
  }

  return null;
}

async function getRateLimitRetryAfter(req: NextRequest): Promise<number | null> {
  const config = getSharedRateLimitConfig();
  if (config) {
    try {
      return await getSharedRateLimitRetryAfter(req, config);
    } catch (error) {
      warnRateLimitFallback(error);
    }
  }

  return getInMemoryRateLimitRetryAfter(req);
}

function isFeishuWebhook(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.includes("feishu.cn") || normalized.includes("lark");
}

function isSlackWebhook(url: string): boolean {
  return url.toLowerCase().includes("hooks.slack.com");
}

function buildFeedbackLines(payload: {
  name: string;
  email: string;
  phone: string;
  message: string;
  puzzleNumber?: number;
}) {
  return [
    "New website feedback received",
    payload.puzzleNumber ? `Puzzle: #${payload.puzzleNumber}` : "Puzzle: general",
    payload.name ? `Name: ${payload.name}` : "Name: not provided",
    payload.email ? `Email: ${payload.email}` : "Email: not provided",
    payload.phone ? `Phone: ${payload.phone}` : "Phone: not provided",
    `Message: ${payload.message}`,
  ];
}

async function postJsonWebhook(
  url: string,
  payload: {
    name: string;
    email: string;
    phone: string;
    message: string;
    puzzleNumber?: number;
  },
  secret?: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-webhook-secret": secret } : {}),
    },
    body: JSON.stringify({
      source: feedbackWebhookSource,
      receivedAt: new Date().toISOString(),
      feedback: {
        name: payload.name || undefined,
        email: payload.email || undefined,
        phone: payload.phone || undefined,
        puzzleNumber: payload.puzzleNumber,
        message: payload.message,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Feedback delivery failed with status ${response.status}.`);
  }
}

async function postFeishuWebhook(
  url: string,
  payload: {
    name: string;
    email: string;
    phone: string;
    message: string;
    puzzleNumber?: number;
  },
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      msg_type: "text",
      content: {
        text: buildFeedbackLines(payload).join("\n"),
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Feishu feedback delivery failed with status ${response.status}.`);
  }
}

async function postSlackWebhook(
  url: string,
  payload: {
    name: string;
    email: string;
    phone: string;
    message: string;
    puzzleNumber?: number;
  },
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      text: buildFeedbackLines(payload).join("\n"),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Slack feedback delivery failed with status ${response.status}.`);
  }
}

async function sendFeedbackWebhook(payload: {
  name: string;
  email: string;
  phone: string;
  message: string;
  puzzleNumber?: number;
}) {
  const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL?.trim();
  const secret = process.env.FEEDBACK_WEBHOOK_SECRET?.trim();
  if (webhookUrl) {
    await postJsonWebhook(webhookUrl, payload, secret);
    return;
  }

  const candidateUrls = [
    process.env.FEISHU_WEBHOOK_URL?.trim(),
    process.env.ALERT_WEBHOOK_URL?.trim(),
    process.env.SLACK_WEBHOOK_URL?.trim(),
  ].filter(Boolean) as string[];

  const deliveries: Promise<void>[] = [];
  const seen = new Set<string>();

  for (const url of candidateUrls) {
    if (seen.has(url)) continue;
    seen.add(url);

    if (isFeishuWebhook(url)) {
      deliveries.push(postFeishuWebhook(url, payload));
      continue;
    }

    if (isSlackWebhook(url)) {
      deliveries.push(postSlackWebhook(url, payload));
    }
  }

  if (deliveries.length === 0) {
    throw new Error(
      `The feedback form is not configured yet. Please email ${supportEmail} directly.`,
    );
  }

  await Promise.all(deliveries);
}

export async function POST(req: NextRequest) {
  if (hasInvalidOrigin(req)) {
    return bad(403, "Cross-site submissions are not allowed.");
  }

  const retryAfter = await getRateLimitRetryAfter(req);
  if (retryAfter !== null) {
    return NextResponse.json(
      {
        code: 429,
        message: "Too many feedback submissions. Please wait a few minutes and try again.",
      },
      {
        status: 429,
        headers: {
          "retry-after": String(retryAfter),
        },
      },
    );
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return bad(400, "Invalid request body.");
  }

  const parsed = feedbackSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return bad(400, firstIssue?.message || "Please check your feedback form.");
  }

  const { website, ...feedback } = parsed.data;
  if (website) {
    return NextResponse.json({
      code: 200,
      message: "Thanks. Your feedback has been received.",
    });
  }

  console.info("feedback.received", {
    hasName: Boolean(feedback.name),
    hasEmail: Boolean(feedback.email),
    hasPhone: Boolean(feedback.phone),
    messageLength: feedback.message.length,
    puzzleNumber: feedback.puzzleNumber,
    receivedAt: new Date().toISOString(),
  });

  try {
    await sendFeedbackWebhook(feedback);
  } catch (error) {
    return bad(
      error instanceof Error && error.message.includes("not configured yet") ? 503 : 502,
      error instanceof Error
        ? error.message
        : `Unable to deliver feedback right now. Please email ${supportEmail} directly.`,
    );
  }

  return NextResponse.json({
    code: 200,
    message: "Thanks. Your feedback has been received.",
  });
}
