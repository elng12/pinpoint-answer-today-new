import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createInMemoryRateLimiter, readPositiveIntegerEnv } from "@/lib/rate-limit";
import { parseAndValidateUrl, validateUrlAgainstAllowlist } from "@/lib/security/url-allowlist";
import { feedbackWebhookSource, supportEmail } from "@/lib/site/config";

export const runtime = "nodejs";

const feedbackRateLimitWindowMs = readPositiveIntegerEnv("FEEDBACK_RATE_LIMIT_WINDOW_MS", 10 * 60 * 1000);
const feedbackRateLimitMaxRequests = readPositiveIntegerEnv("FEEDBACK_RATE_LIMIT_MAX", 5);
const getRateLimitRetryAfter = createInMemoryRateLimiter({
  storeKey: "feedback",
  windowMs: feedbackRateLimitWindowMs,
  maxRequests: feedbackRateLimitMaxRequests,
});

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

function isFeishuWebhook(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.includes("feishu.cn") || normalized.includes("lark");
}

function isSlackWebhook(url: string): boolean {
  return url.toLowerCase().includes("hooks.slack.com");
}

function normalizeGenericWebhookUrl(raw: string): string {
  return parseAndValidateUrl(
    raw,
    {
      allowedSchemes: ["https:"],
      allowAnyHost: true,
      allowLocalhost: process.env.NODE_ENV !== "production",
    },
    "FEEDBACK_WEBHOOK_URL",
  ).toString();
}

function normalizeFeishuWebhookUrl(raw: string): string {
  const url = parseAndValidateUrl(
    raw,
    {
      allowedSchemes: ["https:"],
      allowedHostSuffixes: [".feishu.cn", ".larksuite.com", ".larksuite.com.cn"],
      allowLocalhost: process.env.NODE_ENV !== "production",
    },
    "FEISHU_WEBHOOK_URL",
  );
  return url.toString();
}

function normalizeSlackWebhookUrl(raw: string): string {
  const url = parseAndValidateUrl(
    raw,
    {
      allowedSchemes: ["https:"],
      allowedHosts: ["hooks.slack.com"],
      allowLocalhost: process.env.NODE_ENV !== "production",
    },
    "SLACK_WEBHOOK_URL",
  );
  return url.toString();
}

function normalizeAlertWebhookUrl(raw: string): string {
  const url = parseAndValidateUrl(
    raw,
    {
      allowedSchemes: ["https:"],
      allowAnyHost: true,
      allowLocalhost: process.env.NODE_ENV !== "production",
    },
    "ALERT_WEBHOOK_URL",
  );
  if (isFeishuWebhook(url.toString())) {
    validateUrlAgainstAllowlist(
      url,
      {
        allowedSchemes: ["https:"],
        allowedHostSuffixes: [".feishu.cn", ".larksuite.com", ".larksuite.com.cn"],
        allowLocalhost: process.env.NODE_ENV !== "production",
      },
      "ALERT_WEBHOOK_URL",
    );
  }
  if (isSlackWebhook(url.toString())) {
    validateUrlAgainstAllowlist(
      url,
      {
        allowedSchemes: ["https:"],
        allowedHosts: ["hooks.slack.com"],
        allowLocalhost: process.env.NODE_ENV !== "production",
      },
      "ALERT_WEBHOOK_URL",
    );
  }
  return url.toString();
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
    await postJsonWebhook(normalizeGenericWebhookUrl(webhookUrl), payload, secret);
    return;
  }

  const candidateUrls = [
    process.env.FEISHU_WEBHOOK_URL?.trim() ? normalizeFeishuWebhookUrl(process.env.FEISHU_WEBHOOK_URL.trim()) : null,
    process.env.ALERT_WEBHOOK_URL?.trim() ? normalizeAlertWebhookUrl(process.env.ALERT_WEBHOOK_URL.trim()) : null,
    process.env.SLACK_WEBHOOK_URL?.trim() ? normalizeSlackWebhookUrl(process.env.SLACK_WEBHOOK_URL.trim()) : null,
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

  const retryAfter = getRateLimitRetryAfter(req);
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
