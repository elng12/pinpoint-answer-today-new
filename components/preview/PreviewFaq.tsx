import { SectionHeading } from "@/components/shared/SectionHeading";
import { routes } from "@/lib/paths/routes";

const faqs = [
  {
    question: "When will the next Pinpoint answer be available?",
    answer:
      "We publish shortly after LinkedIn unlocks the next board. If the release is delayed, check back soon.",
  },
  {
    question: "Does this page reveal the future answer early?",
    answer:
      "No. Hints are spoiler-safe and full reveals are opt-in. You control when to view the answer.",
  },
  {
    question: "Where can I find past answers?",
    answer: "Use the archive to browse prior puzzles by number and date.",
  },
  {
    question: "Why does the expected date sometimes change?",
    answer:
      "Pinpoint unlock timing is controlled by LinkedIn and can shift due to time zones, weekends, or delays. Treat any date here as an estimate and rely on the in-app unlock as the source of truth.",
  },
  {
    question: "What should I do if I think an answer is wrong?",
    answer:
      "Please share a correction on the Contact page. Include the puzzle number, your clue list, and if possible a screenshot so we can verify quickly.",
  },
  {
    question: "How do I get updates without refreshing?",
    answer:
      "Bookmark this page and check back after the daily unlock window. The archive and the latest published answer link are updated as soon as we confirm the new board.",
  },
];

export function PreviewFaq() {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <SectionHeading
        eyebrow="FAQ"
        title="Questions people ask before the next board goes live"
        center
      />
      <div className="grid" style={{ marginTop: 24 }}>
        {faqs.map((faq) => (
          <div className="card" key={faq.question}>
            <h3 style={{ marginTop: 0 }}>{faq.question}</h3>
            <p className="copy">{faq.answer}</p>
          </div>
        ))}
      </div>
      <p className="copy" style={{ marginTop: 20 }}>
        Want to suggest an improvement or report an issue?{" "}
        <a href={routes.contact}>Contact us</a> and include the puzzle number plus any context
        that helps us reproduce the board.
      </p>
    </section>
  );
}
