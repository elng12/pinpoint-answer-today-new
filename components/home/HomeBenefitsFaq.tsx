import type { PuzzleDetail } from "@/lib/puzzles/data";

const benefits = [
  {
    icon: "bolt",
    title: "Instant Answers",
    description:
      "LinkedIn Pinpoint answer today stays hidden until you choose reveal.",
  },
  {
    icon: "brain",
    title: "Detailed Clues",
    description:
      "Today's Pinpoint answer notes show the clue path without spoiling first.",
  },
  {
    icon: "calendar",
    title: "Daily updates",
    description:
      "Pinpoint LinkedIn answer today keeps daily boards easy to review.",
  },
  {
    icon: "bookmark",
    title: "Save Your Streak",
    description:
      "Pinpoint LinkedIn answer today notes keep archive checks clear.",
  },
  {
    icon: "layers",
    title: "Pattern training",
    description:
      "Pinpoint answer today LinkedIn recap keeps the verified solve close.",
  },
  {
    icon: "spark",
    title: "Smart solving tips",
    description:
      "Pinpoint answer, LinkedIn clue logic, and the final category stay together.",
  },
];

function BenefitIcon({ icon }: { icon: string }) {
  return (
    <span className="benefit-icon" aria-hidden>
      {icon === "bolt" ? (
        <svg viewBox="0 0 24 24" fill="none" className="benefit-icon-svg">
          <path d="M13 2L6 13h5l-1 9 8-12h-5l0-8z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {icon === "brain" ? (
        <svg viewBox="0 0 24 24" fill="none" className="benefit-icon-svg">
          <path d="M9 6a3 3 0 116 0v1a3 3 0 012 5.24V15a3 3 0 01-3 3h-1v2m-2-2H10a3 3 0 01-3-3v-2.76A3 3 0 019 7V6zm0 0v4m6-4v4m-6 0H7m8 0h2m-5 0v10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {icon === "calendar" ? (
        <svg viewBox="0 0 24 24" fill="none" className="benefit-icon-svg">
          <path d="M7 2v3m10-3v3M4 9h16M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2zm2 8l2 2 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {icon === "bookmark" ? (
        <svg viewBox="0 0 24 24" fill="none" className="benefit-icon-svg">
          <path d="M7 4h10a1 1 0 011 1v15l-6-3-6 3V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {icon === "layers" ? (
        <svg viewBox="0 0 24 24" fill="none" className="benefit-icon-svg">
          <path d="M12 4l8 4-8 4-8-4 8-4zm8 8l-8 4-8-4m16 4l-8 4-8-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {icon === "spark" ? (
        <svg viewBox="0 0 24 24" fill="none" className="benefit-icon-svg">
          <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3zm6 12l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15zM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

export function getFaqItems(puzzle: PuzzleDetail) {
  return [
    {
      question: "When does today's Pinpoint answer become available?",
      answer: `LinkedIn Pinpoint answer today is updated after verification, and Today's Pinpoint answer for Puzzle ${puzzle.number} stays easy to check.`,
    },
    {
      question: "Can I browse historical Pinpoint boards here?",
      answer: "Yes. The archive keeps Pinpoint LinkedIn boards together, with Today's Pinpoint answer notes for recent puzzles.",
    },
    {
      question: "What happens if I miss a day’s puzzle?",
      answer: "Open the archive, compare Today's Pinpoint answer with older boards, and then return to the Pinpoint today recap.",
    },
    {
      question: "Is this an official LinkedIn resource?",
      answer: "No. This is an independent guide. LinkedIn Pinpoint is named only so players know which puzzle the answer covers.",
    },
    {
      question: "How do the clue explanations work?",
      answer: `Each Pinpoint answer, LinkedIn clue, and final category should fit the same connection in the Pinpoint today explanation for ${puzzle.category}.`,
    },
    {
      question: "Why do people search Pinpoint answer today LinkedIn?",
      answer: "Pinpoint answer today LinkedIn is just another way to ask for the same daily guide. A quick Pinpoint LinkedIn answer today check helps when the answer is not obvious, especially after tricky LinkedIn clues.",
    },
  ];
}

export function HomeBenefitsFaq({ puzzle }: { puzzle: PuzzleDetail }) {
  const faqItems = getFaqItems(puzzle);

  return (
    <div className="stack">
      <section className="surface surface-block">
        <div className="home-search-heading home-benefits-heading">
          <p className="eyebrow">Why Pinpoint players use us</p>
          <h2 className="section-title benefit-guide-title">Why Use Our Pinpoint Guide?</h2>
          <p className="copy benefits-intro">
            Use this Pinpoint LinkedIn guide for LinkedIn Pinpoint answer today, Pinpoint LinkedIn answer today notes,
            and a short Pinpoint today checklist.
          </p>
        </div>
        <div className="benefit-guide-grid">
          {benefits.map((item) => (
            <article key={item.title} className="card home-benefit-card benefit-feature-card">
              <div className="benefit-feature-head">
                <BenefitIcon icon={item.icon} />
              </div>
              <div className="benefit-feature-copy">
                <p className="benefit-feature-title">{item.title}</p>
                <p className="copy benefit-feature-description">{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface surface-block">
        <div className="home-search-heading faq-section-heading">
          <h2 className="section-title faq-guide-title">Frequently Asked Questions</h2>
          <p className="copy faq-intro">
            Short answers for LinkedIn players checking Pinpoint today answer, Pinpoint answer LinkedIn help,
            and Today&apos;s Pinpoint answer.
          </p>
        </div>
        <div className="faq-guide-grid">
          {faqItems.map((item) => (
            <article key={item.question} className="card home-benefit-card faq-card-home" data-faq-question={item.question}>
              <h3 className="faq-card-title">{item.question}</h3>
              <p className="copy faq-card-copy">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
