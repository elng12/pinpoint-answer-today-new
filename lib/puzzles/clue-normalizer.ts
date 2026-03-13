export interface NormalizedClue {
  original: string;
  normalized: string;
}

export function normalizeClueForAI(clue: string): NormalizedClue {
  const original = clue.trim();
  let normalized = original;

  if (/\([^)]+\)/.test(normalized)) {
    normalized = normalized
      .replace(/\(like /gi, "similar to ")
      .replace(/\(such as /gi, "including ")
      .replace(/\(e\.g\. /gi, "for example ")
      .replace(/\(i\.e\. /gi, "that is ")
      .replace(/\(or /gi, "or ")
      .replace(/ \/ /g, " or ")
      .replace(/\|/g, " or ")
      .replace(/[()]/g, "");
  }

  normalized = normalized.replace(/^#(\d+)([A-Z])/, "#$1 $2");
  normalized = normalized.replace(/\s+/g, " ").trim();

  return { original, normalized };
}

