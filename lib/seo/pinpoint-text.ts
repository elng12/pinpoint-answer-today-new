export function normalizePinpointClues(
  clues: Array<string | null | undefined>,
): string[] {
  return clues.map((clue) => String(clue ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function normalizePinpointCluesWithFallback(
  clues: Array<string | null | undefined>,
  desiredCount = 5,
): string[] {
  const normalized = normalizePinpointClues(clues);

  while (normalized.length < desiredCount) {
    normalized.push(`Clue ${normalized.length + 1}`);
  }

  return normalized.slice(0, desiredCount);
}

export function joinPinpointClues(clues: string[], useFinalAnd = false): string {
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

export function fitPinpointClues(
  clues: Array<string | null | undefined>,
  maxLength: number,
  useFinalAnd = false,
): string {
  const normalized = normalizePinpointClues(clues);

  for (let count = normalized.length; count >= 1; count -= 1) {
    const candidate = joinPinpointClues(normalized.slice(0, count), useFinalAnd);
    if (candidate.length <= maxLength) {
      return candidate;
    }
  }

  const [firstClue = ""] = normalized;
  if (firstClue.length <= maxLength) {
    return firstClue;
  }

  if (maxLength <= 3) {
    return firstClue.slice(0, maxLength);
  }

  return `${firstClue.slice(0, maxLength - 3).trimEnd()}...`;
}
