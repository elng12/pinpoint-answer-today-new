import type { MetadataRoute } from "next";
import { getSitemapDetailEntries } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { getStaticRouteLastModified } from "@/lib/site/static-page-metadata";

export const revalidate = 86400;

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";
  const primaryRoutes = [
    { path: routes.home, lastModified: getStaticRouteLastModified(routes.home), priority: 1.0 },
    { path: routes.archive, lastModified: getStaticRouteLastModified(routes.archive), priority: 0.9 },
    { path: routes.preview, lastModified: getStaticRouteLastModified(routes.preview), priority: 0.8 },
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

  const detailItems = await getSitemapDetailEntries();
  const detailEntries = detailItems.map((item, index) => ({
    url: `${siteUrl}${withTrailingSlash(routes.detail(item.slug))}`,
    lastModified: new Date(item.updatedAt),
    changeFrequency: "daily" as const,
    priority: index < 10 ? 0.9 : index < 50 ? 0.8 : 0.6,
  }));

  return [...staticEntries, ...detailEntries];
}
