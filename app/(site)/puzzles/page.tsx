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
  buildCanonicalAlternates,
  buildPageMetadata,
} from "@/lib/seo/metadata";
import { StructuredData } from "@/components/seo/StructuredData";

// ISR: revalidate every 24h; on-demand revalidation triggered via /api/revalidate
export const revalidate = 86400;

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  // Reading searchParams here only affects metadata, not the page's static data.
  // The canonical fallback ensures ?q= variants don't compete with the base URL.
  const { q } = await searchParams;
  const metadata = buildPageMetadata({
    title: ARCHIVE_SEO_TITLE,
    description: ARCHIVE_SEO_DESCRIPTION,
    path: routes.archive,
  });
  if (q) {
    metadata.alternates = buildCanonicalAlternates(routes.archive);
  }
  return metadata;
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // NOTE: We read searchParams here only to pass the initial query to the
  // client-side search component. The full groups/entries data is always
  // rendered server-side regardless of the query, so Googlebot sees all
  // 700+ entry links in the HTML regardless of the ?q= param.
  const { q } = await searchParams;
  const groups = await getArchiveEntriesGrouped();
  const archiveEntries = groups.flatMap((group) => group.items);
  const initialGroups = groups;
  const structuredDataItems = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: ARCHIVE_SEO_TITLE,
      url: absoluteUrl(routes.archive),
      hasPart: archiveEntries.slice(0, 20).map((item) => ({
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
      itemListElement: archiveEntries.map((item, index) => {
        const detailPath = withTrailingSlash(routes.detail(item.slug));
        const detailUrl = absoluteUrl(detailPath);

        return {
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Article",
            "@id": detailUrl,
            headline: item.title,
            url: detailUrl,
            image: absoluteUrl(`${detailPath}opengraph-image`),
            datePublished: `${item.isoDate}T00:00:00Z`,
            dateModified: item.updatedAt,
            description:
              item.shortSummary ||
              `LinkedIn Pinpoint #${item.number} answer and clue walkthrough.`,
            author: {
              "@type": "Organization",
              name: "Pinpoint Answer Today",
              url: absoluteUrl(routes.home),
            },
          },
        };
      }),
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
