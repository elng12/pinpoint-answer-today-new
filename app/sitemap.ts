import type { MetadataRoute } from "next";
import { getSitemapDetailEntries } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { getStaticRouteLastModified } from "@/lib/site/static-page-metadata";

export const revalidate = 86400;

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function getNewestDate(values: Array<Date | string | null | undefined>): Date | null {
  const dates = values
    .map((value) => (value instanceof Date ? value : value ? new Date(value) : null))
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  return dates[0] ?? null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";
  const detailItems = getSitemapDetailEntries();
  const newestDetailDate = getNewestDate(detailItems.map((item) => item.updatedAt));
  const newestPreviewDate = getStaticRouteLastModified(routes.preview);
  const dynamicIndexLastModified = newestDetailDate ?? getStaticRouteLastModified(routes.home);

  const primaryRoutes = [
    { path: routes.home, lastModified: dynamicIndexLastModified, priority: 1.0 },
    { path: routes.archive, lastModified: dynamicIndexLastModified, priority: 0.9 },
    {
      path: routes.preview,
      lastModified: getNewestDate([newestPreviewDate, dynamicIndexLastModified]) ?? newestPreviewDate,
      priority: 0.8,
    },
    { path: routes.about, lastModified: getStaticRouteLastModified(routes.about), priority: 0.6 },
  ];

  const indexableLegalRoutes = [
    { path: routes.disclaimer, lastModified: getStaticRouteLastModified(routes.disclaimer) },
  ];

  const staticEntries = [
    ...primaryRoutes.map(({ path, lastModified, priority }) => ({
      url: `${siteUrl}${path}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority,
    })),
    ...indexableLegalRoutes.map(({ path, lastModified }) => ({
      url: `${siteUrl}${path}`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];

  const detailEntries = detailItems.map((item, index) => ({
    url: `${siteUrl}${withTrailingSlash(routes.detail(item.slug))}`,
    lastModified: new Date(item.updatedAt),
    changeFrequency: "daily" as const,
    priority: index < 10 ? 0.9 : index < 50 ? 0.8 : 0.6,
  }));

  return [...staticEntries, ...detailEntries];
}
