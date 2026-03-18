export function HomeBookmarkStrip() {
  return (
    <section className="surface home-bookmark-strip">
      <div className="home-bookmark-icon" aria-hidden>
        Save
      </div>
      <div className="home-bookmark-copy">
        <p className="home-bookmark-title">Bookmark this page for the daily Pinpoint drop</p>
        <p className="copy" style={{ margin: 0 }}>
          Keep the hub close. It is the fastest way back to today&apos;s Pinpoint solution, the next
          Pinpoint preview, and the full Pinpoint archive.
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
