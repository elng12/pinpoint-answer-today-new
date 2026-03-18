export function HomeBookmarkStrip() {
  return (
    <section className="surface home-bookmark-strip">
      <div className="home-bookmark-icon" aria-hidden>
        Save
      </div>
      <div className="home-bookmark-copy">
        <p className="home-bookmark-title">Bookmark this page for the daily Pinpoint drop</p>
        <p className="copy" style={{ margin: 0 }}>
          Keep the hub close. Today&apos;s answer, the next preview, and the full archive stay one
          click away.
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
