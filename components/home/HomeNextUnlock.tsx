import type { NextPreview } from "@/lib/puzzles/data";
import { Countdown } from "@/components/shared/Countdown";

function toUnlockIso(dateIso: string) {
  return `${dateIso}T08:00:00.000Z`;
}

export function HomeNextUnlock({ preview }: { preview: NextPreview | null }) {
  const targetIso = preview ? toUnlockIso(preview.isoDate) : new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  const targetLabel = preview
    ? `Puzzle ${preview.number} unlocks on ${preview.expectedDate} at GMT+8 16:00`
    : "Next preview date coming soon";
  const headline = preview
    ? `Puzzle ${preview.number} unlocks in`
    : "Next puzzle unlocks in";

  return (
    <section className="home-next-unlock">
      <div className="home-next-unlock-inner">
        <div className="home-next-unlock-heading">
          <p className="home-next-unlock-title">{headline}</p>
          <p className="home-next-unlock-copy">
            {preview
              ? `Next unlock at ${preview.expectedDate} 16:00 (Asia/Shanghai). Times shown in your local time zone below.`
              : "We will post the next unlock timing as soon as the next preview window is confirmed."}
          </p>
        </div>
        <Countdown targetIso={targetIso} targetLabel={targetLabel} />
      </div>
    </section>
  );
}
