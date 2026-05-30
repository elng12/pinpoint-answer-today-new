export function HomeBookmarkStrip() {
  return (
    <section className="surface home-bookmark-strip">
      <div className="home-bookmark-icon" aria-hidden>
        Save
      </div>
      <div className="home-bookmark-copy">
        <p className="home-bookmark-title">Bookmark LinkedIn Pinpoint today</p>
        <p className="copy" style={{ margin: 0 }}>
          Keep Today&apos;s Pinpoint answer close, plus Pinpoint today notes, Today&apos;s Pinpoint guide, Today&apos;s Pinpoint clue log, Pinpoint today basics,
          and the next preview.
          The full archive stays one click away.
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
