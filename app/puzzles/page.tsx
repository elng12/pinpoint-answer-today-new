import type { Metadata } from "next";
import { ArchiveExplorer } from "@/components/archive/ArchiveExplorer";
import { ArchiveHeader } from "@/components/archive/ArchiveHeader";
import { getArchiveEntriesGrouped } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { absoluteUrl, buildPageMetadata } from "@/lib/seo/metadata";
import { StructuredData } from "@/components/seo/StructuredData";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: "All Pinpoint Answers Archive",
    description:
      "Browse recent and older Pinpoint answers in one English-only archive, grouped by month and linked to full explanation pages.",
    path: routes.archive,
  });
}

export default function ArchivePage() {
  const groups = getArchiveEntriesGrouped();
  const archiveEntries = groups.flatMap((group) => group.items);
  const structuredDataItems = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "All Pinpoint Answers Archive",
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
