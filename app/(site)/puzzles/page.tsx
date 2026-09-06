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
  buildPageMetadata,
} from "@/lib/seo/metadata";

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
  const structuredDataItems = buildArchiveStructuredData(archiveEntries);

  return (
    <main className="container" style={{ padding: "32px 0 56px" }}>
      <StructuredData items={structuredDataItems} />
      <div className="stack">
        <ArchiveHeader totalCount={archiveEntries.length} />
        <ArchiveExplorer initialGroups={groups} totalCount={archiveEntries.length} />
      </div>
    </main>
  );
}
