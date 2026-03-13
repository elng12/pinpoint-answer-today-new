import { createSocialImageResponse } from "@/lib/seo/social-image";

export const runtime = "edge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const puzzleNumber = slug.match(/(\d+)$/)?.[1];

  return createSocialImageResponse({
    eyebrow: puzzleNumber ? `Puzzle #${puzzleNumber}` : "LinkedIn Pinpoint archive",
    title: "Pinpoint Answer Today",
    subtitle: puzzleNumber
      ? `Spoiler-safe hints, full walkthrough, and archive recap for Puzzle ${puzzleNumber}.`
      : "Open the latest verified answer, spoiler-safe hints, and puzzle archive recap.",
  });
}
