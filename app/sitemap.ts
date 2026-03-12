import type { MetadataRoute } from "next";
import { getSitemapDetailEntries } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";
  const staticRoutes = [
    routes.home,
    routes.archive,
    routes.about,
    routes.contact,
    routes.privacy,
    routes.terms,
    routes.disclaimer,
  ];

  const staticEntries = staticRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }));

  const detailEntries = (await getSitemapDetailEntries()).map((item) => ({
    url: `${siteUrl}${routes.detail(item.slug)}`,
    lastModified: new Date(item.updatedAt),
  }));

  return [...staticEntries, ...detailEntries];
}
