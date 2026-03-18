import { SectionHeading } from "@/components/site/ui/SectionHeading";

const steps = [
  {
    label: "1) Check timing",
    body: "The expected date shown above is an estimate based on recent releases. If the schedule shifts, this page stays safe to use and will refresh as soon as we detect a confirmed unlock.",
  },
  {
    label: "2) Use the playbook",
    body: "Work through the spoiler-safe checklist and pattern cues. The goal is to reduce brute force guessing and help you quickly form strong groups once clues appear.",
  },
  {
    label: "3) Verify via archive",
    body: "When the puzzle is live, jump to the latest published answer or browse the archive. Those pages are where we keep the full recap, clue breakdown, and final answers.",
  },
];

export function PreviewHowItWorks() {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <SectionHeading eyebrow="Getting started" title="How this preview works" center />
      <p className="copy" style={{ marginTop: 12 }}>
        This page captures the &ldquo;next / tomorrow / upcoming&rdquo; search intent without
        sending thin, pre-generated puzzle pages into search. The preview stays stable and helpful
        even when the next board has not unlocked yet. Once LinkedIn releases the new puzzle, we
        confirm the board and update the archive plus the latest answer page as quickly as possible.
      </p>
      <div className="grid grid-3" style={{ marginTop: 24 }}>
        {steps.map((step) => (
          <div className="card" key={step.label}>
            <p className="eyebrow">{step.label}</p>
            <p className="copy" style={{ marginTop: 8 }}>
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
