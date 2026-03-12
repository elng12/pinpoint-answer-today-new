const pinpointFacts = [
  "New puzzle released daily",
  "Five clues share one hidden connection",
  "Test one clean rule across all five clues",
  "Review the clue-by-clue breakdown after reveal",
  "Keep your streak safe and your archive easy to browse",
];

export function HomeWhatIs() {
  return (
    <section className="surface surface-block home-what-is-section">
      <div className="home-search-heading home-what-is-heading">
        <p className="eyebrow">What is Pinpoint?</p>
        <h2 className="section-title">What is LinkedIn Pinpoint?</h2>
        <p className="copy home-what-is-copy">
          LinkedIn Pinpoint is a daily word puzzle where five clues all point to one hidden
          connection. Pinpoint Answer Today helps you move from spoiler-safe clues to a clean
          answer recap without getting buried in the old-site clutter.
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
