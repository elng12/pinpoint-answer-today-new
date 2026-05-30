import type { Metadata } from "next";
import { defaultLocale } from "@/i18n.config";
import { defaultSocialImagePath, siteName, twitterHandle } from "@/lib/site/config";
import { fitPinpointClues } from "@/lib/seo/pinpoint-text";
import { CONTENT_CONTRACT } from "@/lib/puzzles/content-contract";

// Locked homepage SERP copy. Do not add puzzle numbers unless the homepage SEO contract is explicitly changed.
export const HOME_SEO_TITLE = "LinkedIn Pinpoint Answer Today - Daily Answers & Solutions";
export const HOME_SEO_DESCRIPTION =
  "Find the Pinpoint answer today for LinkedIn Pinpoint, with spoiler-safe hints, clue explanations, today's solution, and recent Pinpoint answers in one place.";
export const ARCHIVE_SEO_TITLE = "LinkedIn Pinpoint Archive | Past Answers by Puzzle Number";
export const ARCHIVE_SEO_DESCRIPTION =
  "Browse past LinkedIn Pinpoint answers in one archive. Search by puzzle number or clue, then open the matching answer page fast.";
const TITLE_ABSOLUTE_MAX = 110;
const TITLE_MIN_LENGTH = 55;
const DESCRIPTION_MAX_LENGTH = CONTENT_CONTRACT.metaDescriptionMaxChars;
const DESCRIPTION_MIN_LENGTH = CONTENT_CONTRACT.metaDescriptionMinChars;
const SITE_LOCALE = "en_US";
const DESCRIPTION_EXTENSIONS = [
  " Use the clue order, answer reasoning, FAQ, and verified answer to confirm the solve.",
  " Use the clue order, reasoning, and FAQ to confirm the solve.",
  " Review answer reasoning and FAQ.",
  " Review clue logic and FAQ.",
  " Confirm the solve with answer reasoning.",
  " Reasoning included.",
  " FAQ included.",
  " More help inside.",
];

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";
}

export function absoluteUrl(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}

export function buildPuzzleSeoTitle(puzzleNumber: number, clues: string[]): string {
  const fullClues = fitPinpointClues(clues, TITLE_ABSOLUTE_MAX);
  const allCluesTitle = `LinkedIn Pinpoint ${puzzleNumber}: ${fullClues}`;

  // Prefer all 5 clues in title for maximum keyword coverage (Google indexes the
  // full title tag even when SERP truncates the display).  Cap at ABSOLUTE_MAX
  // to avoid absurdly long titles on pathological clue text.
  if (allCluesTitle.length <= TITLE_ABSOLUTE_MAX && allCluesTitle.length >= TITLE_MIN_LENGTH) {
    return allCluesTitle;
  }

  // Fallback: try shorter prefixes that fit within SERP display width so at
  // least something is visible without truncation.
  const titlePrefixes = [
    `LinkedIn Pinpoint ${puzzleNumber}: `,
    `LinkedIn Pinpoint ${puzzleNumber}:`,
    `LinkedIn Pinpoint ${puzzleNumber} - `,
    `LinkedIn Pinpoint ${puzzleNumber} Clues: `,
    `LinkedIn Pinpoint ${puzzleNumber} Answer: `,
    `LinkedIn Pinpoint ${puzzleNumber} Hints: `,
  ];

  const candidates = titlePrefixes
    .map((prefix) => `${prefix}${fitPinpointClues(clues, TITLE_ABSOLUTE_MAX - prefix.length)}`)
    .filter((title) => title.length <= TITLE_ABSOLUTE_MAX);

  const bestInRange = candidates
    .filter((title) => title.length >= TITLE_MIN_LENGTH)
    .sort((left, right) => right.length - left.length)[0];

  if (bestInRange) {
    return bestInRange;
  }

  return candidates.sort((left, right) => right.length - left.length)[0] ?? `LinkedIn Pinpoint ${puzzleNumber}`;
}

function padDescriptionToContract(description: string): string {
  if (description.length >= DESCRIPTION_MIN_LENGTH) {
    return description;
  }

  const candidates = DESCRIPTION_EXTENSIONS
    .map((extension) => `${description}${extension}`)
    .filter((candidate) => candidate.length <= DESCRIPTION_MAX_LENGTH);
  const inRange = candidates
    .filter((candidate) => candidate.length >= DESCRIPTION_MIN_LENGTH)
    .sort((left, right) => right.length - left.length)[0];

  return inRange ?? candidates.sort((left, right) => right.length - left.length)[0] ?? description;
}

function pickDescriptionCandidate(candidates: string[], fallback: string): string {
  const uniqueCandidates = Array.from(new Set([...candidates, fallback].map((candidate) => candidate.trim())))
    .filter(Boolean);

  const inRange = uniqueCandidates.filter(
    (c) => c.length >= DESCRIPTION_MIN_LENGTH && c.length <= DESCRIPTION_MAX_LENGTH,
  );

  const bestInRange = inRange
    .sort((left, right) => right.length - left.length)[0];
  if (bestInRange) return bestInRange;

  const paddedCandidates = uniqueCandidates.map(padDescriptionToContract);
  const bestPaddedInRange = paddedCandidates
    .filter((candidate) => candidate.length >= DESCRIPTION_MIN_LENGTH && candidate.length <= DESCRIPTION_MAX_LENGTH)
    .sort((left, right) => right.length - left.length)[0];

  if (bestPaddedInRange) return bestPaddedInRange;

  return uniqueCandidates.sort((left, right) => right.length - left.length)[0] ?? fallback;
}

function normalizeSeoAnswer(answer?: string): string {
  return (answer ?? "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

function appendAnswerWhenItFits(description: string, answer?: string): string {
  const normalizedAnswer = normalizeSeoAnswer(answer);
  if (!normalizedAnswer) return description;

  const suffix = ` Answer: ${normalizedAnswer}.`;
  if (description.includes(suffix.trim())) return description;
  const next = `${description}${suffix}`;
  return next.length <= CONTENT_CONTRACT.metaDescriptionIndexMaxChars ? next : description;
}

export function buildPuzzleSeoDescription(
  puzzleNumber: number,
  clues: string[],
  answer?: string,
): string {
  const candidates: string[] = [];

  const descriptionTemplates = [
    {
      prefix: `Explore LinkedIn Pinpoint ${puzzleNumber} with `,
      suffix: "Get the clue order, answer reasoning, FAQ, and the verified answer fast.",
    },
    {
      prefix: `Explore LinkedIn Pinpoint ${puzzleNumber} with `,
      suffix: "Get the clue order, answer reveal, reasoning, and FAQ fast.",
    },
    {
      prefix: `Solve LinkedIn Pinpoint ${puzzleNumber} using `,
      suffix: "Get the clue order, answer reasoning, FAQ, and the verified answer fast.",
    },
    {
      prefix: `Find LinkedIn Pinpoint ${puzzleNumber} from `,
      suffix: "Get the clue order, answer reasoning, FAQ, and the verified answer fast.",
    },
    {
      prefix: `LinkedIn Pinpoint ${puzzleNumber} uses `,
      suffix: "Get the clue order, answer reasoning, FAQ, and the verified answer fast.",
    },
  ];

  candidates.push(
    ...descriptionTemplates.map(({ prefix, suffix }) => {
      const clueText = fitPinpointClues(
        clues,
        DESCRIPTION_MAX_LENGTH - prefix.length - suffix.length - 2,
        true,
      );
      return `${prefix}${clueText}. ${suffix}`;
    }),
  );

  const baseDescription = pickDescriptionCandidate(
    candidates,
    `LinkedIn Pinpoint ${puzzleNumber} answer guide with clue order, answer reasoning, FAQ, and the verified solution for the current puzzle, updated daily.`,
  );
  return appendAnswerWhenItFits(baseDescription, answer);
}

function buildSocialImage(imagePath: string, alt: string) {
  return {
    url: absoluteUrl(imagePath),
    width: 1200,
    height: 630,
    alt,
  };
}

export function buildCanonicalAlternates(path: string): NonNullable<Metadata["alternates"]> {
  const url = absoluteUrl(path);

  return {
    canonical: url,
    languages: {
      [defaultLocale]: url,
      "x-default": url,
    },
  };
}

function buildIconMetadata(): Pick<Metadata, "appleWebApp" | "icons" | "manifest"> {
  return {
    appleWebApp: {
      title: siteName,
    },
    icons: {
      icon: [
        { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
        { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      ],
      shortcut: [{ url: "/favicon/favicon.ico" }],
      apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    manifest: "/favicon/site.webmanifest",
  };
}

// Root layout metadata exists only as the app-wide fallback.
// Page routes should use buildPageMetadata(path) so their canonical and alternates stay page-specific.
export function buildSiteMetadata({
  title,
  description,
  includeAlternates = true,
  includeSocial = true,
}: {
  title: string;
  description: string;
  includeAlternates?: boolean;
  includeSocial?: boolean;
}): Metadata {
  const baseUrl = getSiteUrl();
  const socialImage = buildSocialImage(defaultSocialImagePath, `${siteName} social preview`);

  const verificationCode = process.env.GOOGLE_SITE_VERIFICATION;

  return {
    ...buildIconMetadata(),
    metadataBase: new URL(baseUrl),
    title,
    description,
    ...(verificationCode && {
      verification: {
        google: verificationCode,
      },
    }),
    ...(includeAlternates && {
      alternates: buildCanonicalAlternates("/"),
    }),
    ...(includeSocial && {
      openGraph: {
        title,
        description,
        type: "website",
        url: absoluteUrl("/"),
        siteName,
        locale: SITE_LOCALE,
        images: [socialImage],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [socialImage],
        ...(twitterHandle ? { site: twitterHandle } : {}),
      },
    }),
  };
}

export function buildPageMetadata({
  title,
  description,
  path,
  noIndex = false,
  type = "website",
  socialImagePath = defaultSocialImagePath,
  socialImageAlt = `${siteName} social preview`,
}: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
  type?: "website" | "article";
  socialImagePath?: string;
  socialImageAlt?: string;
}): Metadata {
  const url = absoluteUrl(path);
  const socialImage = buildSocialImage(socialImagePath, socialImageAlt);

  return {
    ...buildIconMetadata(),
    title,
    description,
    alternates: buildCanonicalAlternates(path),
    robots: {
      index: !noIndex,
      follow: true,
    },
    openGraph: {
      title,
      description,
      type,
      url,
      siteName,
      locale: SITE_LOCALE,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
      ...(twitterHandle ? { site: twitterHandle } : {}),
    },
  };
}
