export function ArchiveHeader({ totalCount }: { totalCount: number }) {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <p className="eyebrow">Archive</p>
      <h1 className="section-title">All LinkedIn Pinpoint Answers Updated Daily</h1>
      <p className="copy">
        Search every past LinkedIn Pinpoint answer by puzzle number, clue, or date, then open the matching solution page.
      </p>
      <div className="chip-row" style={{ marginTop: 18 }}>
        <span className="chip">{totalCount} answer pages</span>
        <span className="chip">Search by clue or number</span>
        <span className="chip">Updated with today&apos;s answer</span>
      </div>
    </section>
  );
}
