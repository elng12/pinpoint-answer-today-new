import { SectionHeading } from "@/components/shared/SectionHeading";

const cards = [
  {
    title: "Pattern triggers",
    items: [
      "One word looks like a category label. Treat it as a potential anchor.",
      "Several words share a suffix or prefix. Test a word-form group early.",
      "A mix of proper nouns appears. Consider places, brands, or famous names.",
      "Many short words show up. Look for abbreviations or common acronyms.",
      "Multiple items feel like \"tools\" or \"roles\". Try a functional grouping.",
      "Two items obviously pair. Ask what the missing two would look like.",
    ],
  },
  {
    title: "Decoy defenses",
    items: [
      "If a word fits too easily, assume it might be a decoy and confirm twice.",
      "Do not force a theme to include an outlier. Outliers are a signal, not noise.",
      "When two groups overlap, pick the tighter rule and reassign the ambiguous word.",
      "Switch from \"meaning\" to \"form\" if you keep guessing wrong categories.",
      "Write your rule as a sentence. If it feels vague, the group is probably wrong.",
      "After a failed attempt, change only one variable at a time to learn faster.",
    ],
  },
  {
    title: "Speed tactics",
    items: [
      "Start with your strongest group, not the first group you notice.",
      "Lock one set before exploring edge cases. Momentum improves accuracy.",
      "Use quick elimination: if a word belongs nowhere, it defines the missing theme.",
      "Prefer concrete lists (cities, instruments) over abstract adjectives early.",
      "If you are close, pause and test your rule against every item, one by one.",
      "After unlock, use the latest answer page to verify and learn the pattern.",
    ],
  },
];

export function PreviewTipLibrary() {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <SectionHeading
        eyebrow="Toolkit"
        title="Pro tip library (no spoilers)"
        description="Common, reusable tactics that help across themes. Use one or two at a time instead of trying to apply everything at once."
        center
      />
      <div className="grid grid-3" style={{ marginTop: 24 }}>
        {cards.map((card) => (
          <div className="card" key={card.title}>
            <p className="eyebrow">{card.title}</p>
            <ul className="copy" style={{ marginTop: 12, paddingLeft: 20, lineHeight: 2 }}>
              {card.items.map((item) => (
                <li key={item} style={{ marginBottom: 4 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="copy" style={{ marginTop: 20 }}>
        Over time, these tactics become automatic. That is the advantage of a stable preview hub:
        you build skill even on days when you do not want spoilers. When the new board is live, you
        can shift from training mode to verification mode by jumping to the archive.
      </p>
    </section>
  );
}
