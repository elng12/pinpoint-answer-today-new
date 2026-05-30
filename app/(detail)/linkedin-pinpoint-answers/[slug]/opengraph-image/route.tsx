import { createSocialImageResponse } from "@/lib/seo/social-image";
import { fitPinpointClues } from "@/lib/seo/pinpoint-text";
import { getBundledRegistryEntries } from "@/lib/puzzles/registry-bundled";

export const runtime = "edge";

function isPublicDetailEntry(entry: ReturnType<typeof getBundledRegistryEntries>[number]): boolean {
  const detailState =
    entry.detailState ?? (entry.status === "draft" || entry.status === "preview" ? "draft" : "published");

  return (
    (entry.status === "live" || entry.status === "archived") &&
    (detailState === "published" || detailState === "fallback_full")
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const puzzle = getBundledRegistryEntries().find((entry) => entry.slug === slug && isPublicDetailEntry(entry));
  const puzzleNumber = slug.match(/(\d+)$/)?.[1];

  let res: Response;

  if (puzzle) {
    const titlePrefix = `Pinpoint #${puzzle.puzzleNumber}: `;
    const clueText = fitPinpointClues(puzzle.clues, 92 - titlePrefix.length);

    res = createSocialImageResponse({
      eyebrow: `LinkedIn Pinpoint #${puzzle.puzzleNumber}`,
      title: clueText ? `${titlePrefix}${clueText}` : `Pinpoint #${puzzle.puzzleNumber} answer guide`,
      subtitle: "Clue order, answer reveal, reasoning, FAQ, and verified answer.",
    });
  } else {
    res = createSocialImageResponse({
      eyebrow: puzzleNumber ? `Puzzle #${puzzleNumber}` : "LinkedIn Pinpoint archive",
      title: "Pinpoint Answer Today",
      subtitle: puzzleNumber
        ? `Clue order, answer reasoning, FAQ, and archive recap for Puzzle ${puzzleNumber}.`
        : "Open the latest verified answer, clue order, reasoning, and archive recap.",
    });
  }

  res.headers.set(
    "Cache-Control",
    "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  );
  return res;
}
