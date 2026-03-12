import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const feedbackSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).default(""),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().min(3).max(3000),
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

export async function POST(req: NextRequest) {
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

  const feedback = parsed.data;

  console.info("feedback.received", {
    name: feedback.name || undefined,
    email: feedback.email || undefined,
    phone: feedback.phone || undefined,
    message: feedback.message,
    puzzleNumber: feedback.puzzleNumber,
    receivedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    code: 200,
    message: "Thanks. Your feedback has been received.",
  });
}
