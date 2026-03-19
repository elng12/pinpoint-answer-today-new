import {
  joinPinpointClues,
  normalizePinpointCluesWithFallback,
} from "@/lib/seo/pinpoint-text";

function getRequiredClues(words?: Array<string | null | undefined>): string[] {
  return normalizePinpointCluesWithFallback(words ?? [], 5);
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
    if (description.length >= 120) break;
    if (description.length + extra.length <= 165) {
      description += extra;
    }
  }

  if (description.length < 115) {
    description = `${description} Full hints inside.`;
  }

  return description;
}
