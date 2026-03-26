import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@/lib/paths/routes";
import { getLegacyConnectorRedirectSlug } from "@/lib/puzzles/data";

export const revalidate = 86400;

export default async function LegacyConnectorSingularPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detailSlug = await getLegacyConnectorRedirectSlug(slug);

  if (!detailSlug) {
    notFound();
  }

  permanentRedirect(`${routes.detail(detailSlug)}/`);
}
