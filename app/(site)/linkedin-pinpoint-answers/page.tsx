import { Suspense } from "react";
import type { Metadata } from "next";
import { ArchiveExplorer } from "@/components/archive/ArchiveExplorer";
import { ArchiveHeader } from "@/components/archive/ArchiveHeader";
import { StructuredData } from "@/components/seo/StructuredData";
import { routes } from "@/lib/paths/routes";
import { getArchiveEntriesGrouped } from "@/lib/puzzles/data";
import { buildArchiveStructuredData } from "@/lib/seo/archive-structured-data";
import {
  ARCHIVE_SEO_DESCRIPTION,
  ARCHIVE_SEO_TITLE,
  buildCanonicalAlternates,
  buildPageMetadata,
} from "@/lib/seo/metadata";

export const revalidate = 86400;

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
    metadata.alternates = buildCanonicalAlternates(routes.archive);
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
  const structuredDataItems = buildArchiveStructuredData(archiveEntries);

  return (
    <main className="container" style={{ padding: "32px 0 56px" }}>
      <StructuredData items={structuredDataItems} />
      <div className="stack">
        <ArchiveHeader totalCount={archiveEntries.length} />
        <Suspense>
          <ArchiveExplorer initialGroups={groups} totalCount={archiveEntries.length} initialQuery={q ?? ""} />
        </Suspense>
      </div>
    </main>
  );
}
