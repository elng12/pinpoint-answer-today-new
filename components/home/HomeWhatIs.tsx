const pinpointFacts = [
  "New LinkedIn Pinpoint puzzle released daily",
  "Today's Pinpoint answer starts with five clues",
  "Test one clean rule across all five clues",
  "Review Pinpoint answer, LinkedIn clue, and category after reveal",
  "Keep Pinpoint answer LinkedIn checks easy",
];

export function HomeWhatIs() {
  return (
    <section className="surface surface-block home-what-is-section">
      <div className="home-search-heading home-what-is-heading">
        <p className="eyebrow">What is Pinpoint?</p>
        <h2 className="section-title">What is LinkedIn Pinpoint?</h2>
        <p className="copy home-what-is-copy">
          LinkedIn Pinpoint is a daily word puzzle where five clues all point to one hidden
          connection. People checking LinkedIn Pinpoint answer today, Today&apos;s Pinpoint answer,
          or Pinpoint today answer help usually test a few patterns first. The Pinpoint today recap
          then keeps the final answer and archive close.
        </p>
      </div>

      <div className="home-what-is-grid">
        {pinpointFacts.map((item, index) => (
          <article key={item} className="home-what-is-card">
            <span className="home-what-is-step" aria-hidden>
              {index + 1}
            </span>
            <p className="home-what-is-card-title">{item}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
