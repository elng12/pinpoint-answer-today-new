import { SectionHeading } from "@/components/shared/SectionHeading";

const cards = [
  {
    title: "Fast start (first 60 seconds)",
    items: [
      { bold: "Scan for obvious twins:", rest: " plural nouns, verb forms, acronyms, or words that share a suffix." },
      { bold: "Mark anchors:", rest: " any word that feels like a category label (country, sport, chemical, job title, brand)." },
      { bold: "Avoid early over-commit:", rest: " if a word fits two categories, hold it out until you see a cleaner set." },
      { bold: "Look for a theme clue:", rest: " sometimes the puzzle includes one word that hints the meta-theme (time, travel, tech, art, finance)." },
      { bold: "Use exclusions:", rest: " if three items clearly belong together, identify what cannot belong and narrow the rest." },
    ],
  },
  {
    title: "Build groups with confidence",
    items: [
      { bold: "Prefer tight groups:", rest: " the best sets share one unambiguous property, not a vague vibe." },
      { bold: "Check part of speech:", rest: " nouns with nouns, verbs with verbs, adjectives with adjectives. Mixed forms are possible, but less common." },
      { bold: "Watch for wordplay:", rest: " homophones, abbreviations, and alternate spellings can produce surprising links." },
      { bold: "Use geography carefully:", rest: " cities, states, and countries often cluster, but some words double as brands or surnames." },
      { bold: "Validate with examples:", rest: " if your theme is \"types of ___\", try to say the full phrase aloud for each word." },
    ],
  },
  {
    title: "When you get stuck",
    items: [
      { bold: "Reset with a new lens:", rest: " regroup by length, spelling pattern, or initials to break a mental lock." },
      { bold: "Try \"category families\":", rest: " food, sports, music, movies, business, science, nature, and everyday objects are frequent sources." },
      { bold: "Assume one decoy:", rest: " puzzles often include a word that appears to match a group but belongs elsewhere." },
      { bold: "Use the archive mindset:", rest: " recall recent puzzles you solved. Recurring structures show up more often than you might expect." },
      { bold: "Take a short break:", rest: " stepping away for two minutes can surface a pattern you missed." },
    ],
  },
  {
    title: "Verification checklist",
    items: [
      { bold: "Confirm all members:", rest: " every word should fit the rule without special pleading." },
      { bold: "Avoid mixed specificity:", rest: " do not pair \"a continent\" with \"a city\" unless the theme explicitly says so." },
      { bold: "Check spelling variants:", rest: " some puzzles rely on US/UK spelling, hyphenation, or common abbreviations." },
      { bold: "Double-check overlaps:", rest: " if one word seems to belong to two groups, the board likely wants the less obvious assignment." },
      { bold: "Use the latest answer page:", rest: " after unlock, compare your final grouping against the verified walkthrough." },
    ],
  },
];

export function PreviewPlaybook() {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <SectionHeading
        eyebrow="Strategy"
        title="Spoiler-safe solving playbook"
        description="Pinpoint rewards pattern recognition. Use these guidelines as a repeatable workflow for every daily board."
        center
      />
      <div className="grid grid-2" style={{ marginTop: 24 }}>
        {cards.map((card) => (
          <div className="card" key={card.title}>
            <p className="eyebrow">{card.title}</p>
            <ul className="copy" style={{ marginTop: 12, paddingLeft: 20, lineHeight: 2 }}>
              {card.items.map((item) => (
                <li key={item.bold}>
                  <strong>{item.bold}</strong>
                  {item.rest}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="copy" style={{ marginTop: 20 }}>
        The goal is not to memorize facts. It is to build a repeatable process: identify anchors,
        test tight group rules, and protect yourself from decoys. If you practice that workflow
        daily, you will solve faster and with fewer guesses, even when the theme is unfamiliar.
      </p>
    </section>
  );
}
