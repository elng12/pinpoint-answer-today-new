import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@/lib/site/routes";
import { getPuzzleSlugByNumber } from "@/lib/puzzles/data";

export const revalidate = 86400;

export default async function LegacyPuzzleNumberPage({
  params,
}: {
  params: Promise<{ puzzleNumber: string }>;
}) {
  const { puzzleNumber } = await params;

  if (!/^\d+$/.test(puzzleNumber)) {
    notFound();
  }

  const slug = await getPuzzleSlugByNumber(Number(puzzleNumber));
  if (!slug) {
    notFound();
  }

  permanentRedirect(routes.detail(slug));
}
