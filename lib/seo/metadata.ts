import type { Metadata } from "next";
import { defaultLocale } from "@/i18n.config";
import { defaultSocialImagePath, siteName, twitterHandle } from "@/lib/site/config";
import { fitPinpointClues } from "@/lib/seo/pinpoint-text";
import { CONTENT_CONTRACT } from "@/lib/puzzles/content-contract";

export const HOME_SEO_TITLE = "LinkedIn Pinpoint Answer Today | Current Puzzle, Hints & Answer";
export const HOME_SEO_DESCRIPTION =
  "Get today's LinkedIn Pinpoint answer for the current puzzle with spoiler-safe hints, clue help, and a fast path to the final solution.";
export const ARCHIVE_SEO_TITLE = "LinkedIn Pinpoint Archive | Past Answers by Puzzle Number";
export const ARCHIVE_SEO_DESCRIPTION =
  "Browse past LinkedIn Pinpoint answers in one archive. Search by puzzle number or clue, then open the matching answer page fast.";
const TITLE_ABSOLUTE_MAX = 110;
const TITLE_MIN_LENGTH = 55;
const DESCRIPTION_MAX_LENGTH = CONTENT_CONTRACT.metaDescriptionMaxChars;
const DESCRIPTION_MIN_LENGTH = CONTENT_CONTRACT.metaDescriptionMinChars;
const SITE_LOCALE = "en_US";
const DESCRIPTION_EXTENSIONS = [
  " Use spoiler-safe hints, clue logic, and the verified answer to confirm the solve.",
  " Use spoiler-safe hints and clue logic to confirm the solve.",
  " Review spoiler-safe hints and clue logic.",
  " Review clue logic and confirm the solve.",
  " Confirm the solve with clue logic.",
  " Spoiler-safe hints included.",
  " More help inside.",
  " Hints included.",
  " Extra hints.",
  " Hints.",
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
    .filter(Boolean)
    .filter((candidate) => candidate.length <= DESCRIPTION_MAX_LENGTH);
  const bestInRange = uniqueCandidates
    .filter((candidate) => candidate.length >= DESCRIPTION_MIN_LENGTH)
    .sort((left, right) => right.length - left.length)[0];

  if (bestInRange) {
    return bestInRange;
  }

  const paddedCandidates = uniqueCandidates.map(padDescriptionToContract);
  const bestPaddedInRange = paddedCandidates
    .filter((candidate) => candidate.length >= DESCRIPTION_MIN_LENGTH && candidate.length <= DESCRIPTION_MAX_LENGTH)
    .sort((left, right) => right.length - left.length)[0];

  if (bestPaddedInRange) {
    return bestPaddedInRange;
  }

  return uniqueCandidates.sort((left, right) => right.length - left.length)[0] ?? fallback;
}

export function buildPuzzleSeoDescription(
  puzzleNumber: number,
  clues: string[],
  answer?: string,
): string {
  const answerCandidates: string[] = [];
  const candidates: string[] = [];

  // When the answer is known, build a description that reveals it at the end.
  // Searchers querying "pinpoint NNN answer" get the answer in the snippet,
  // which increases click-through rate significantly.
  if (answer) {
    const suffix = `. Spoiler-safe hints and a full walkthrough included. Answer: ${answer}.`;
    const prefix = `LinkedIn Pinpoint ${puzzleNumber} clues: `;
    const maxClueLength = DESCRIPTION_MAX_LENGTH - prefix.length - suffix.length;
    if (maxClueLength > 0) {
      const clueText = fitPinpointClues(clues, maxClueLength, true);
      if (clueText) {
        answerCandidates.push(`${prefix}${clueText}${suffix}`);
      }
    }
  }

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

  if (answer) {
    const answerDescription = pickDescriptionCandidate(
      answerCandidates,
      `LinkedIn Pinpoint ${puzzleNumber} answer guide with spoiler-safe hints, clue logic, a full walkthrough, and the verified solution for the current puzzle. Answer: ${answer}.`,
    );

    if (
      answerDescription.includes(`Answer: ${answer}.`) &&
      answerDescription.length >= DESCRIPTION_MIN_LENGTH &&
      answerDescription.length <= DESCRIPTION_MAX_LENGTH
    ) {
      return answerDescription;
    }
  }

  return pickDescriptionCandidate(
    candidates,
    `LinkedIn Pinpoint ${puzzleNumber} answer guide with spoiler-safe hints, clue logic, a full walkthrough, and the verified solution for the current puzzle, updated daily.`,
  );
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
