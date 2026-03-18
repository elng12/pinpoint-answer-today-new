import { SectionHeading } from "@/components/site/ui/SectionHeading";

export function ArchiveHeader({ totalCount }: { totalCount: number }) {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <SectionHeading
        eyebrow="Archive"
        title="All Pinpoint Answers"
        description="Use the archive as the clean history hub: grouped by month, searchable by clue or puzzle number, and linked into full explanation pages."
      />
      <div className="chip-row" style={{ marginTop: 18 }}>
        <span className="chip">{totalCount} indexed puzzles</span>
        <span className="chip">English-only archive</span>
        <span className="chip">Direct links to full analysis</span>
      </div>
    </section>
  );
}
