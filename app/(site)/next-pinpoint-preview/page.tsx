import type { Metadata } from "next";
import { PreviewCommonPatterns } from "@/components/preview/PreviewCommonPatterns";
import { PreviewCountdown } from "@/components/preview/PreviewCountdown";
import { PreviewFaq } from "@/components/preview/PreviewFaq";
import { PreviewGlossary } from "@/components/preview/PreviewGlossary";
import { PreviewHero } from "@/components/preview/PreviewHero";
import { PreviewHowItWorks } from "@/components/preview/PreviewHowItWorks";
import { PreviewPlaybook } from "@/components/preview/PreviewPlaybook";
import { PreviewQuickLinks } from "@/components/preview/PreviewQuickLinks";
import { PreviewTipLibrary } from "@/components/preview/PreviewTipLibrary";
import { PreviewValueProps } from "@/components/preview/PreviewValueProps";
import { HomeCtaFooter } from "@/components/home/HomeCtaFooter";
import { getCurrentPuzzle, getNextPreview, getRecentEntries } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const preview = await getNextPreview();
  const puzzleLabel = preview ? `#${preview.number}` : "the next puzzle";

  return buildPageMetadata({
    title: `LinkedIn Pinpoint ${puzzleLabel} Preview — Coming Soon`,
    description:
      "Get ready for the next LinkedIn Pinpoint answer with spoiler-safe tips, common answer patterns, and quick links to the latest verified solution.",
    path: routes.preview,
    noIndex: true,
  });
}

export default async function PreviewPage() {
  const [preview, archive] = await Promise.all([
    getNextPreview(),
    getRecentEntries(6),
  ]);

  let latestEntry: Awaited<ReturnType<typeof getRecentEntries>>[number] | null = null;
  try {
    const live = await getCurrentPuzzle();
    latestEntry = archive.find((e) => e.slug === live.slug) ?? archive[0] ?? null;
  } catch {
    latestEntry = archive[0] ?? null;
  }

  return (
    <main className="container" style={{ padding: "32px 0 56px" }}>
      <div className="stack">
        <PreviewHero preview={preview} latestEntry={latestEntry} />
        <PreviewValueProps />
        <PreviewQuickLinks latestEntries={archive} />
        {preview ? (
          <PreviewCountdown isoDate={preview.isoDate} puzzleNumber={preview.number} />
        ) : null}
        <PreviewHowItWorks />
        <PreviewCommonPatterns />
        <PreviewPlaybook />
        <PreviewTipLibrary />
        <PreviewGlossary />
        <PreviewFaq />
        {latestEntry ? (
          <HomeCtaFooter currentSlug={latestEntry.slug} />
        ) : null}
      </div>
    </main>
  );
}
