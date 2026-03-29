import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@/lib/paths/routes";
import { getLegacyThemeRedirectSlug } from "@/lib/puzzles/data";

export const revalidate = 86400;

export default async function LegacyThemePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detailSlug = await getLegacyThemeRedirectSlug(slug);

  if (!detailSlug) {
    notFound();
  }

  permanentRedirect(routes.detail(detailSlug));
}
