import type { PuzzleDetail } from "@/lib/puzzles/data";
import { SectionHeading } from "@/components/site/ui/SectionHeading";

export function getHomeFaqItems(puzzle: PuzzleDetail) {
  return [
    {
      question: `What is the Pinpoint answer today for Puzzle ${puzzle.number}?`,
      answer: `The answer for Puzzle ${puzzle.number} is ${puzzle.answer}. Use the reveal above for a quick check or open the detail page for the full explanation.`,
    },
    {
      question: "Where can I browse older Pinpoint answers?",
      answer: "Use the archive page to review recent and older puzzles.",
    },
    {
      question: "What is LinkedIn Pinpoint?",
      answer: "It is a daily word-association puzzle built around a shared connection.",
    },
  ];
}

export function HomeFaq({ puzzle }: { puzzle: PuzzleDetail }) {
  const faqs = getHomeFaqItems(puzzle);

  return (
    <section className="surface" style={{ padding: 32 }}>
      <SectionHeading
        eyebrow="FAQ"
        title="Quick answers before you click through"
        description="On the homepage, FAQ should explain and guide. It should not replace the detail page."
      />
      <div className="grid" style={{ marginTop: 24 }}>
        {faqs.map((faq) => (
          <div className="card" key={faq.question}>
            <h3 style={{ marginTop: 0 }}>{faq.question}</h3>
            <p className="copy">{faq.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
