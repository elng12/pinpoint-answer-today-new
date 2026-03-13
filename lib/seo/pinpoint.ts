function cleanWords(words: Array<string | null | undefined>): string[] {
  const cleaned = (words ?? [])
    .map((word) => String(word ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  while (cleaned.length < 5) {
    cleaned.push(`Clue ${cleaned.length + 1}`);
  }
  return cleaned.slice(0, 5);
}

function formatClueList(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
}

export function buildPinpointTitle(issue: number | string, words?: Array<string | null | undefined>): string {
  const clueList = cleanWords(words ?? []).join(", ");
  return `LinkedIn Pinpoint #${String(issue).trim()}: ${clueList}`;
}

export function buildPinpointDescription(
  issue: number | string,
  words?: Array<string | null | undefined>,
): string {
  const clueList = formatClueList(cleanWords(words ?? []));
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

