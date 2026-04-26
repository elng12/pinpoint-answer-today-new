import { Suspense } from "react";
import type { Metadata } from "next";
import { ArchiveExplorer } from "@/components/archive/ArchiveExplorer";
import { ArchiveHeader } from "@/components/archive/ArchiveHeader";
import { getArchiveEntriesGrouped } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import {
  ARCHIVE_SEO_DESCRIPTION,
  ARCHIVE_SEO_TITLE,
  buildCanonicalAlternates,
  buildPageMetadata,
} from "@/lib/seo/metadata";
import { buildArchiveStructuredData } from "@/lib/seo/archive-structured-data";
import { StructuredData } from "@/components/seo/StructuredData";

// ISR: revalidate every 24h; on-demand revalidation triggered via /api/revalidate
export const revalidate = 86400;

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
  const structuredDataItems = buildArchiveStructuredData(archiveEntries);

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
