import type { Metadata } from "next";
import { ArchiveExplorer } from "@/components/archive/ArchiveExplorer";
import { ArchiveHeader } from "@/components/archive/ArchiveHeader";
import { getArchiveEntriesGrouped } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import {
  absoluteUrl,
  ARCHIVE_SEO_DESCRIPTION,
  ARCHIVE_SEO_TITLE,
  buildPageMetadata,
} from "@/lib/seo/metadata";
import { StructuredData } from "@/components/seo/StructuredData";

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: ARCHIVE_SEO_TITLE,
    description: ARCHIVE_SEO_DESCRIPTION,
    path: routes.archive,
  });
}

export default async function ArchivePage() {
  const groups = await getArchiveEntriesGrouped();
  const archiveEntries = groups.flatMap((group) => group.items);
  const structuredDataItems = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: ARCHIVE_SEO_TITLE,
      url: absoluteUrl(routes.archive),
      hasPart: archiveEntries.slice(0, 20).map((item) => ({
        "@type": "WebPage",
        name: item.title,
        url: absoluteUrl(routes.detail(item.slug)),
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

  return (
    <main className="container" style={{ padding: "32px 0 56px" }}>
      <StructuredData items={structuredDataItems} />
      <div className="stack">
        <ArchiveHeader totalCount={archiveEntries.length} />
        <ArchiveExplorer groups={groups} />
      </div>
    </main>
  );
}
