const pinpointFacts = [
  "Daily LinkedIn word puzzle",
  "Five clues, one shared connection",
  "Reveal the answer only when you are ready",
  "Check why each clue fits",
  "Browse older answers in the archive",
];

export function HomeWhatIs() {
  return (
    <section className="surface surface-block home-what-is-section">
      <div className="home-search-heading home-what-is-heading">
        <p className="eyebrow">What is Pinpoint?</p>
        <h2 className="section-title">What is LinkedIn Pinpoint?</h2>
        <p className="copy home-what-is-copy">
          LinkedIn Pinpoint is a daily word puzzle where five clues all point to one hidden
          connection. This page gives today&apos;s final answer, the clue logic, and links to
          recent and older answer pages.
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
