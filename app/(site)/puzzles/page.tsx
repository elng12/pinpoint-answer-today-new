import { Suspense } from "react";
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
const INITIAL_ARCHIVE_LIMIT = 24;

function getInitialArchiveGroups(groups: Awaited<ReturnType<typeof getArchiveEntriesGrouped>>) {
  let remaining = INITIAL_ARCHIVE_LIMIT;
  const initialGroups: typeof groups = [];

  for (const group of groups) {
    if (remaining <= 0) {
      break;
    }

    const items = group.items.slice(0, remaining);
    initialGroups.push({ ...group, items });
    remaining -= items.length;
  }

  return initialGroups;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const metadata = buildPageMetadata({
    title: ARCHIVE_SEO_TITLE,
    description: ARCHIVE_SEO_DESCRIPTION,
    path: routes.archive,
  });
  if (q) {
    metadata.alternates = { canonical: absoluteUrl(routes.archive) };
  }
  return metadata;
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const groups = await getArchiveEntriesGrouped();
  const archiveEntries = groups.flatMap((group) => group.items);
  const initialGroups = getInitialArchiveGroups(groups);
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
        <Suspense>
          <ArchiveExplorer initialGroups={initialGroups} totalCount={archiveEntries.length} initialQuery={q ?? ""} />
        </Suspense>
      </div>
    </main>
  );
}
