import { routes } from "@/lib/paths/routes";
import { supportEmail } from "@/lib/site/config";
import { absoluteUrl, HOME_SEO_DESCRIPTION } from "@/lib/seo/metadata";
import type { ArchiveEntry, PuzzleDetail } from "@/lib/puzzles/data";

type HomeStructuredCurrent = Pick<PuzzleDetail, "answer" | "clues" | "number" | "slug" | "updatedAt">;
type HomeStructuredRecent = Pick<ArchiveEntry, "clues" | "number" | "slug">;

function buildHomeFaqItems(current: HomeStructuredCurrent) {
  return [
    {
      question: "What is today's LinkedIn Pinpoint answer?",
      answer: `Today's LinkedIn Pinpoint answer for Puzzle ${current.number} is ${current.answer}.`,
    },
    {
      question: "What clues are in today's LinkedIn Pinpoint?",
      answer: `Puzzle ${current.number} uses these clues: ${current.clues.join(", ")}.`,
    },
    {
      question: "Can I see older LinkedIn Pinpoint answers?",
      answer: "Yes. The archive lists past Pinpoint answers by puzzle number, clue, and date.",
    },
  ];
}

export function buildHomeStructuredData(
  current: HomeStructuredCurrent,
  recentEntries: HomeStructuredRecent[] = [],
): Record<string, unknown>[] {
  const currentDetailUrl = absoluteUrl(routes.detail(current.slug));
  const recentList = [current, ...recentEntries]
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.slug === entry.slug) === index)
    .slice(0, 10);
  const faqItems = buildHomeFaqItems(current);

  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Pinpoint Answer Today",
      url: absoluteUrl(routes.home),
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/favicon/apple-touch-icon.png"),
        width: 180,
        height: 180,
      },
      description: HOME_SEO_DESCRIPTION,
      email: supportEmail,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: supportEmail,
          url: absoluteUrl(routes.contact),
          availableLanguage: ["en"],
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Pinpoint Answer Today",
      url: absoluteUrl(routes.home),
      description: HOME_SEO_DESCRIPTION,
      inLanguage: "en-US",
      potentialAction: {
        "@type": "SearchAction",
        target: `${absoluteUrl(routes.archive)}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Game",
      "@id": "https://www.linkedin.com/games/pinpoint/#game",
      name: "LinkedIn Pinpoint",
      url: "https://www.linkedin.com/games/pinpoint/",
      description: "Daily word puzzle game from LinkedIn.",
      publisher: {
        "@type": "Organization",
        name: "LinkedIn",
        url: "https://www.linkedin.com/",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `Today's LinkedIn Pinpoint ${current.number} Answer`,
      url: absoluteUrl(routes.home),
      description: HOME_SEO_DESCRIPTION,
      inLanguage: "en-US",
      dateModified: current.updatedAt,
      about: {
        "@id": "https://www.linkedin.com/games/pinpoint/#game",
      },
      mainEntity: {
        "@type": "Question",
        name: `What is the LinkedIn Pinpoint ${current.number} answer?`,
        text: `LinkedIn Pinpoint ${current.number} clues: ${current.clues.join(", ")}`,
        answerCount: 1,
        acceptedAnswer: {
          "@type": "Answer",
          text: current.answer,
          url: currentDetailUrl,
        },
      },
      significantLink: currentDetailUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Recent LinkedIn Pinpoint answers",
      numberOfItems: recentList.length,
      itemListElement: recentList.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(routes.detail(entry.slug)),
        name: `LinkedIn Pinpoint ${entry.number}: ${entry.clues.join(", ")}`,
      })),
    },
  ];
}
