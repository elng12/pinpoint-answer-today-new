function stripQuotes(value: string): string {
  return value.replace(/["“”]/g, "");
}

export type AnswerPattern =
  | { kind: "before"; token: string }
  | { kind: "after"; token: string }
  | { kind: "typed-category"; noun: string; singularNoun: string }
  | { kind: "category"; label: string };

export function detectAnswerPattern(answer: string): AnswerPattern {
  const before = answer.match(/^Words that come before\s+["“]?(.+?)["”]?$/i);
  if (before?.[1]) return { kind: "before", token: before[1] };

  const after = answer.match(/^Words that come after\s+["“]?(.+?)["”]?$/i);
  if (after?.[1]) return { kind: "after", token: after[1] };

  const typedCategory = answer.match(/^(Types|Kinds)\s+of\s+(.+)$/i);
  if (typedCategory?.[2]) {
    const noun = typedCategory[2].replace(/["“”]/g, "").trim();
    const words = noun.split(/\s+/);
    const lastWord = words[words.length - 1] || noun;
    let singularLastWord = lastWord;

    if (/ies$/i.test(lastWord)) {
      singularLastWord = `${lastWord.slice(0, -3)}y`;
    } else if (/(ches|shes|xes|zes)$/i.test(lastWord)) {
      // searches -> search, boxes -> box
      singularLastWord = lastWord.slice(0, -2);
    } else if (/s$/i.test(lastWord) && !/ss$/i.test(lastWord)) {
      singularLastWord = lastWord.slice(0, -1);
    }

    const singularNoun = [...words.slice(0, -1), singularLastWord].join(" ").trim();
    return { kind: "typed-category", noun, singularNoun: singularNoun || noun };
  }

  return { kind: "category", label: stripQuotes(answer).trim() || "the shared category" };
}
