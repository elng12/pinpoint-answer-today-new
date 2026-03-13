import type { Metadata } from "next";
import { defaultSocialImagePath, siteName } from "@/lib/site/config";

export const HOME_SEO_TITLE = "LinkedIn Pinpoint Answer Today - Daily Answers & Solutions";
export const HOME_SEO_DESCRIPTION =
  "Find today's LinkedIn Pinpoint answer instantly - updated daily with clear solutions, clue explanations, and tips that help protect your streak every day.";
export const ARCHIVE_SEO_TITLE = "LinkedIn Pinpoint Archive & Guides | Pinpoint Answer Today";
export const ARCHIVE_SEO_DESCRIPTION =
  "Browse LinkedIn Pinpoint walkthroughs, clue guides, archive pages, and past answers. Open the latest recap fast or revisit older puzzles in one place.";
const TITLE_MAX_LENGTH = 60;
const TITLE_MIN_LENGTH = 55;
const DESCRIPTION_MAX_LENGTH = 160;
const DESCRIPTION_MIN_LENGTH = 150;

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";
}

export function absoluteUrl(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}

function normalizeSeoClues(clues: string[]): string[] {
  return clues.map((clue) => clue.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function joinSeoClues(clues: string[], useFinalAnd = false): string {
  if (clues.length === 0) {
    return "";
  }

  if (!useFinalAnd || clues.length === 1) {
    return clues.join(", ");
  }

  if (clues.length === 2) {
    return `${clues[0]} and ${clues[1]}`;
  }

  return `${clues.slice(0, -1).join(", ")}, and ${clues[clues.length - 1]}`;
}

function fitSeoClues(clues: string[], maxLength: number, useFinalAnd = false): string {
  const normalizedClues = normalizeSeoClues(clues);

  for (let count = normalizedClues.length; count >= 1; count -= 1) {
    const candidate = joinSeoClues(normalizedClues.slice(0, count), useFinalAnd);
    if (candidate.length <= maxLength) {
      return candidate;
    }
  }

  const [firstClue = ""] = normalizedClues;
  if (firstClue.length <= maxLength) {
    return firstClue;
  }

  if (maxLength <= 3) {
    return firstClue.slice(0, maxLength);
  }

  return `${firstClue.slice(0, maxLength - 3).trimEnd()}...`;
}

export function buildPuzzleSeoTitle(puzzleNumber: number, clues: string[]): string {
  const titlePrefixes = [
    `LinkedIn Pinpoint ${puzzleNumber}: `,
    `LinkedIn Pinpoint ${puzzleNumber}:`,
    `LinkedIn Pinpoint ${puzzleNumber} - `,
    `LinkedIn Pinpoint ${puzzleNumber} Clues: `,
    `LinkedIn Pinpoint ${puzzleNumber} Answer: `,
    `LinkedIn Pinpoint ${puzzleNumber} Hints: `,
  ];

  const candidates = titlePrefixes
    .map((prefix) => `${prefix}${fitSeoClues(clues, TITLE_MAX_LENGTH - prefix.length)}`)
    .filter((title) => title.length <= TITLE_MAX_LENGTH);

  const bestInRange = candidates
    .filter((title) => title.length >= TITLE_MIN_LENGTH)
    .sort((left, right) => right.length - left.length)[0];

  if (bestInRange) {
    return bestInRange;
  }

  return candidates.sort((left, right) => right.length - left.length)[0] ?? `LinkedIn Pinpoint ${puzzleNumber}`;
}

export function buildPuzzleSeoDescription(puzzleNumber: number, clues: string[]): string {
  const descriptionTemplates = [
    {
      prefix: `Explore LinkedIn Pinpoint ${puzzleNumber} with `,
      suffix: "Get spoiler-safe hints, clue logic, a full walkthrough, and the verified answer fast.",
    },
    {
      prefix: `Explore LinkedIn Pinpoint ${puzzleNumber} with `,
      suffix: "Get spoiler-safe hints, a full walkthrough, and the verified answer fast.",
    },
    {
      prefix: `Solve LinkedIn Pinpoint ${puzzleNumber} using `,
      suffix: "Get spoiler-safe hints, clue logic, a full walkthrough, and the verified answer fast.",
    },
    {
      prefix: `Find LinkedIn Pinpoint ${puzzleNumber} from `,
      suffix: "Get spoiler-safe hints, clue logic, a full walkthrough, and the verified answer fast.",
    },
    {
      prefix: `LinkedIn Pinpoint ${puzzleNumber} uses `,
      suffix: "Get spoiler-safe hints, clue logic, a full walkthrough, and the verified answer fast.",
    },
  ];

  const candidates = descriptionTemplates
    .map(({ prefix, suffix }) => {
      const clueText = fitSeoClues(
        clues,
        DESCRIPTION_MAX_LENGTH - prefix.length - suffix.length - 2,
        true,
      );
      return `${prefix}${clueText}. ${suffix}`;
    })
    .filter((description) => description.length <= DESCRIPTION_MAX_LENGTH);

  const bestInRange = candidates
    .filter((description) => description.length >= DESCRIPTION_MIN_LENGTH)
    .sort((left, right) => right.length - left.length)[0];

  if (bestInRange) {
    return bestInRange;
  }

  return candidates.sort((left, right) => right.length - left.length)[0]
    ?? `Explore LinkedIn Pinpoint ${puzzleNumber} with clue hints and a full walkthrough.`;
}

function getDefaultSocialImageUrl(): string {
  return absoluteUrl(defaultSocialImagePath);
}

function buildSocialImage(imagePath: string, alt: string) {
  return {
    url: absoluteUrl(imagePath),
    width: 1200,
    height: 630,
    alt,
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

export function buildSiteMetadata({
  title,
  description,
}: {
  title: string;
  description: string;
}): Metadata {
  const baseUrl = getSiteUrl();
  const socialImage = buildSocialImage(defaultSocialImagePath, `${siteName} social preview`);

  return {
    ...buildIconMetadata(),
    metadataBase: new URL(baseUrl),
    title,
    description,
    alternates: {
      canonical: absoluteUrl("/"),
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: absoluteUrl("/"),
      siteName,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage.url],
    },
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
    alternates: {
      canonical: url,
    },
    robots: noIndex
      ? {
          index: false,
          follow: true,
        }
      : undefined,
    openGraph: {
      title,
      description,
      type,
      url,
      siteName,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage.url],
    },
  };
}
