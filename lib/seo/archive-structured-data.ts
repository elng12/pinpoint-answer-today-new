import type { ArchiveEntry } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import {
  absoluteUrl,
  ARCHIVE_SEO_TITLE,
} from "@/lib/seo/metadata";

const COLLECTION_HAS_PART_LIMIT = 20;

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export function buildArchiveStructuredData(archiveEntries: ArchiveEntry[]): Record<string, unknown>[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: ARCHIVE_SEO_TITLE,
      url: absoluteUrl(routes.archive),
      hasPart: archiveEntries.slice(0, COLLECTION_HAS_PART_LIMIT).map((item) => ({
        "@type": "WebPage",
        name: item.title,
        url: absoluteUrl(withTrailingSlash(routes.detail(item.slug))),
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "LinkedIn Pinpoint Answers Archive",
      url: absoluteUrl(routes.archive),
      numberOfItems: archiveEntries.length,
      itemListElement: archiveEntries.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(withTrailingSlash(routes.detail(item.slug))),
        name: item.title,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl(routes.home),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Archive",
          item: absoluteUrl(routes.archive),
        },
      ],
    },
  ];
}
