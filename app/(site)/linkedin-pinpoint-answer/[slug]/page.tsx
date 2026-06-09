import { notFound, permanentRedirect } from "next/navigation";
import { getPuzzleSlugByNumber } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

export const revalidate = 86400;

export default async function AnswerDetailAliasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const match = slug.match(/^pinpoint-(\d+)$/);

  if (!match) {
    notFound();
  }

  const detailSlug = await getPuzzleSlugByNumber(Number(match[1]));
  if (!detailSlug) {
    notFound();
  }

  permanentRedirect(routes.detail(detailSlug));
}
