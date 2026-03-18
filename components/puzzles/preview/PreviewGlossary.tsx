import { SectionHeading } from "@/components/site/ui/SectionHeading";

const terms = [
  {
    term: "Anchor",
    definition:
      "A word that strongly suggests a category. Anchors help you form your first reliable hypothesis quickly.",
  },
  {
    term: "Decoy",
    definition:
      "A word that appears to fit a group but actually belongs elsewhere. Decoys are the main reason early guesses fail.",
  },
  {
    term: "Tight rule",
    definition:
      "A group definition that clearly includes the four items and excludes most others. Tight rules beat vague vibes.",
  },
  {
    term: "Word-form group",
    definition:
      "A set linked by spelling or grammar (prefix, suffix, tense, pluralization) instead of meaning. These are common in daily boards.",
  },
  {
    term: "Overlap",
    definition:
      "When one word could belong to multiple groups. Overlap is a hint that the intended grouping is more specific than your first guess.",
  },
  {
    term: "Verification",
    definition:
      "The final check where you apply your rule to every word. Verification prevents \"almost right\" groups that collapse later.",
  },
];

export function PreviewGlossary() {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <SectionHeading
        eyebrow="Reference"
        title="Mini glossary"
        description="A few simple terms can make your solving process more consistent when comparing your approach against the verified walkthrough."
        center
      />
      <div className="grid grid-2" style={{ marginTop: 24 }}>
        {terms.map(({ term, definition }) => (
          <div className="card" key={term}>
            <h3 style={{ marginTop: 0 }}>{term}</h3>
            <p className="copy">{definition}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
