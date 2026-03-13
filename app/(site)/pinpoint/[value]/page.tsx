import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getCurrentPuzzle, getPuzzleSlugByNumber, getPuzzleSlugByPublishDate } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

export const revalidate = 86400;

export default async function LegacyPinpointValuePage({
  params,
}: {
  params: Promise<{ value: string }>;
}) {
  const { value } = await params;

  if (value === "today") {
    const current = await getCurrentPuzzle();
    redirect(routes.detail(current.slug));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const slug = await getPuzzleSlugByPublishDate(value);
    if (!slug) {
      notFound();
    }
    permanentRedirect(routes.detail(slug));
  }

  if (/^\d+$/.test(value)) {
    const slug = await getPuzzleSlugByNumber(Number(value));
    if (!slug) {
      notFound();
    }
    permanentRedirect(routes.detail(slug));
  }

  const analysisMatch = value.match(/^(\d+)-analysis$/);
  if (analysisMatch) {
    const slug = await getPuzzleSlugByNumber(Number(analysisMatch[1]));
    if (!slug) {
      notFound();
    }
    permanentRedirect(routes.detail(slug));
  }

  notFound();
}
