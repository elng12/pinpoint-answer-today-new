import type { MetadataRoute } from "next";
import { getSitemapDetailEntries } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

export const revalidate = 86400;

const HOME_LAST_MODIFIED = new Date("2026-03-13T00:00:00.000Z");
const ARCHIVE_LAST_MODIFIED = new Date("2026-03-13T00:00:00.000Z");
const ABOUT_LAST_MODIFIED = new Date("2026-03-12T00:00:00.000Z");
const LEGAL_LAST_MODIFIED = new Date("2026-01-01T00:00:00.000Z");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";
  const staticRoutes = [
    { path: routes.home, lastModified: HOME_LAST_MODIFIED },
    { path: routes.archive, lastModified: ARCHIVE_LAST_MODIFIED },
    { path: routes.about, lastModified: ABOUT_LAST_MODIFIED },
    { path: routes.contact, lastModified: LEGAL_LAST_MODIFIED },
    { path: routes.privacy, lastModified: LEGAL_LAST_MODIFIED },
    { path: routes.terms, lastModified: LEGAL_LAST_MODIFIED },
    { path: routes.disclaimer, lastModified: LEGAL_LAST_MODIFIED },
  ];

  const staticEntries = staticRoutes.map(({ path, lastModified }) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    changeFrequency: "daily" as const,
    priority: 1.0,
  }));

  const detailItems = await getSitemapDetailEntries();
  const detailEntries = detailItems.map((item, index) => ({
    url: `${siteUrl}${routes.detail(item.slug)}`,
    lastModified: new Date(item.updatedAt),
    changeFrequency: "daily" as const,
    priority: index < 10 ? 0.9 : index < 50 ? 0.8 : 0.6,
  }));

  return [...staticEntries, ...detailEntries];
}
