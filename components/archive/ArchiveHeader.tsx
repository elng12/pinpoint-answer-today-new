export function ArchiveHeader({ totalCount }: { totalCount: number }) {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <p className="eyebrow">Archive</p>
      <h1 className="section-title">LinkedIn Pinpoint Archive</h1>
      <p className="copy">
        Search past LinkedIn Pinpoint answers by puzzle number or clue, then jump into the matching answer page.
      </p>
      <div className="chip-row" style={{ marginTop: 18 }}>
        <span className="chip">{totalCount} archived puzzles</span>
        <span className="chip">Search by clue or number</span>
        <span className="chip">Open the matching answer page</span>
      </div>
    </section>
  );
}
