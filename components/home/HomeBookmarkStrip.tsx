export function HomeBookmarkStrip() {
  return (
    <section className="surface home-bookmark-strip">
      <div className="home-bookmark-icon" aria-hidden>
        Save
      </div>
      <div className="home-bookmark-copy">
        <p className="home-bookmark-title">Save today&apos;s Pinpoint page</p>
        <p className="copy" style={{ margin: 0 }}>
          Keep the daily answer, clue notes, full breakdown, and archive links in one place.
          The page updates every day.
        </p>
      </div>
      <div className="home-bookmark-tip">
        <span className="eyebrow" style={{ marginBottom: 4, display: "block" }}>
          Pro Tip
        </span>
        <span>Use your browser shortcut to pin it now.</span>
      </div>
    </section>
  );
}
