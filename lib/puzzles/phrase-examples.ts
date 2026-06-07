export type PhraseExampleDirection = "before" | "after";
export type PhrasePatternExampleReason =
  | "hyphen-gloss"
  | "symbol-replacement"
  | "closed-compound"
  | "plain";

export type PhrasePatternExampleResult = {
  phrase: string;
  reason: PhrasePatternExampleReason;
};

const CLOSED_COMPOUND_PAIRS = new Set([
  "cut|back",
  "feed|back",
  "flash|back",
  "hump|back",
  "paper|back",
  "hand|kerchief",
  "hand|made",
  "hand|shake",
  "hand|stand",
  "hand|writing",
  "paper|weight",
]);

function stripPhraseQuotes(value: string): string {
  return value.replace(/["“”]/g, "").trim();
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePairPart(value: string): string {
  return stripPhraseQuotes(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function joinClosedCompound(left: string, right: string): string {
  return `${left}${right.charAt(0).toLowerCase()}${right.slice(1)}`;
}

function shouldJoinClosedCompound(left: string, right: string): boolean {
  return CLOSED_COMPOUND_PAIRS.has(`${normalizePairPart(left)}|${normalizePairPart(right)}`);
}

function buildSymbolReplacement(clue: string, token: string): string {
  const symbolGroupPattern = /\(\s*[^\p{L}\p{N}]+\s*\)|[^\p{L}\p{N}\s()'"&,-]+/gu;
  const replaced = clue.replace(symbolGroupPattern, ` ${token} `);
  if (replaced === clue) return "";
  return stripPhraseQuotes(compactWhitespace(replaced.replace(/\(\s*\)/g, "")));
}

function buildHyphenGlossPhrase(clue: string, token: string, direction: PhraseExampleDirection): string {
  const match = clue.match(/^(.+?)-\s*\([^)]*[A-Za-z][^)]*\)\s*$/);
  if (!match?.[1]) return "";

  const base = stripPhraseQuotes(match[1]).replace(/\s+$/g, "");
  if (!base) return "";
  const cleanToken = stripPhraseQuotes(token).toLowerCase();
  return direction === "before" ? `${base}-${cleanToken}` : `${cleanToken}-${base.toLowerCase()}`;
}

function cleanPhraseClue(clue: string): string {
  return stripPhraseQuotes(
    compactWhitespace(
      clue
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/[-–—]+$/g, ""),
    ),
  );
}

export function buildPhrasePatternExampleResult(
  clue: string,
  token: string,
  direction: PhraseExampleDirection,
): PhrasePatternExampleResult {
  const cleanToken = stripPhraseQuotes(token);
  const hyphenGloss = buildHyphenGlossPhrase(clue, cleanToken, direction);
  if (hyphenGloss) return { phrase: hyphenGloss, reason: "hyphen-gloss" };

  const symbolReplacement = buildSymbolReplacement(clue, cleanToken);
  if (symbolReplacement) return { phrase: symbolReplacement, reason: "symbol-replacement" };

  const cleanClue = cleanPhraseClue(clue) || stripPhraseQuotes(clue);
  const left = direction === "before" ? cleanClue : cleanToken;
  const right = direction === "before" ? cleanToken : cleanClue;
  if (shouldJoinClosedCompound(left, right)) {
    return { phrase: joinClosedCompound(left, right), reason: "closed-compound" };
  }
  return { phrase: `${left} ${right}`.trim(), reason: "plain" };
}

export function buildPhrasePatternExample(
  clue: string,
  token: string,
  direction: PhraseExampleDirection,
): string {
  return buildPhrasePatternExampleResult(clue, token, direction).phrase;
}
