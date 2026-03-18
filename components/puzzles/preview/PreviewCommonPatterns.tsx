import { SectionHeading } from "@/components/site/ui/SectionHeading";

const patterns = [
  {
    icon: "🔗",
    title: "Compound Words",
    description: "Words that come before or after a common word.",
    examples: [
      'Words before "line"',
      'Words before "stone"',
      'Words after "sun"',
      'Words before "fire"',
    ],
  },
  {
    icon: "🔄",
    title: "Synonyms & Word Meanings",
    description: "Words with similar meanings or semantic relationships.",
    examples: [
      'Synonyms for "old"',
      'Words meaning "run"',
      "Different ways to say the same thing",
    ],
  },
  {
    icon: "📂",
    title: "Category Groups",
    description: "Items belonging to the same thematic category.",
    examples: [
      "Cooking-related items",
      "Kitchen appliances",
      "Sports equipment",
      "Types of soils",
    ],
  },
  {
    icon: "✨",
    title: "Shared Properties",
    description: "Items that share a common physical or functional characteristic.",
    examples: [
      "Things with shells",
      "Things with springs",
      "Things made of wool",
      "Metal objects",
    ],
  },
  {
    icon: "⚡",
    title: "Action-Based",
    description: "Items that can undergo the same action or process.",
    examples: [
      "Things that can be folded",
      "Things that can be shredded",
      "Things that can be locked",
      "Things you can fill",
    ],
  },
  {
    icon: "📍",
    title: "Location-Based",
    description: "Items found in the same place or environment.",
    examples: [
      "Things in a kitchen",
      "Things at a beach",
      "Office supplies",
      "Things at a doctor's office",
    ],
  },
];

const tips = [
  "Look for compound word patterns first — test if words pair with the same prefix/suffix.",
  "Think about what actions can be performed on the items.",
  "Check if items share a physical characteristic or component.",
  "Don't overthink — the simplest connection is often correct.",
  "Consider synonyms or words with similar meanings.",
  "Consider where these items might be found together.",
  "If words seem unrelated, try compound categories — some connections can be obscure.",
  "The final clue usually confirms the answer.",
];

export function PreviewCommonPatterns() {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <SectionHeading
        eyebrow="Strategy Guide"
        title="Common LinkedIn Pinpoint Answer Patterns"
        description="Master these puzzle types to solve faster. Understanding these patterns will help you recognize connections more quickly and improve your solving strategy."
        center
      />

      <div className="grid grid-2" style={{ marginTop: 24 }}>
        {patterns.map((pattern) => (
          <div className="card" key={pattern.title}>
            <p style={{ fontSize: 24, marginTop: 0, marginBottom: 8 }}>{pattern.icon}</p>
            <p className="eyebrow">{pattern.title}</p>
            <p className="copy" style={{ marginTop: 4 }}>
              {pattern.description}
            </p>
            <p className="copy" style={{ marginTop: 8, fontWeight: 600 }}>
              Examples:
            </p>
            <ul className="copy" style={{ marginTop: 4, paddingLeft: 20 }}>
              {pattern.examples.map((ex) => (
                <li key={ex}>{ex}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32 }}>
        <p className="eyebrow">Pro Solving Tips</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 8,
            marginTop: 12,
          }}
        >
          {tips.map((tip) => (
            <p className="copy" key={tip} style={{ margin: 0, paddingLeft: 16, borderLeft: "2px solid var(--color-brand, #6366f1)" }}>
              {tip}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
