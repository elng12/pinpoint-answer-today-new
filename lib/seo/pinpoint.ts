import {
  joinPinpointClues,
  normalizePinpointCluesWithFallback,
} from "@/lib/seo/pinpoint-text";
import { CONTENT_CONTRACT } from "@/lib/puzzles/content-contract";

function getRequiredClues(words?: Array<string | null | undefined>): string[] {
  return normalizePinpointCluesWithFallback(words ?? [], 5);
}

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

function padDescriptionToContract(description: string): string {
  if (description.length >= CONTENT_CONTRACT.metaDescriptionMinChars) {
    return description;
  }

  const candidates = DESCRIPTION_EXTENSIONS
    .map((extension) => `${description}${extension}`)
    .filter((candidate) => candidate.length <= CONTENT_CONTRACT.metaDescriptionMaxChars);
  const inRange = candidates
    .filter((candidate) => candidate.length >= CONTENT_CONTRACT.metaDescriptionMinChars)
    .sort((left, right) => right.length - left.length)[0];

  return inRange ?? candidates.sort((left, right) => right.length - left.length)[0] ?? description;
}

export function buildPinpointTitle(issue: number | string, words?: Array<string | null | undefined>): string {
  const clueList = getRequiredClues(words).join(", ");
  return `LinkedIn Pinpoint #${String(issue).trim()}: ${clueList}`;
}

export function buildPinpointDescription(
  issue: number | string,
  words?: Array<string | null | undefined>,
): string {
  // Draft-generation SEO copy must keep all five clues present to satisfy the content contract.
  const clueList = joinPinpointClues(getRequiredClues(words), true);
  const base = `LinkedIn Pinpoint #${String(issue).trim()} clues: ${clueList}.`;
  const extras = [
    " Spoiler-safe hints and a clue-by-clue walkthrough are included.",
    " Spoiler-safe hints and a walkthrough are included.",
    " Full hints inside.",
  ];

  let description = base;
  for (const extra of extras) {
    if (description.length >= CONTENT_CONTRACT.metaDescriptionMinChars - 30) break;
    if (description.length + extra.length <= CONTENT_CONTRACT.metaDescriptionMaxChars) {
      description += extra;
    }
  }

  return padDescriptionToContract(description);
}
