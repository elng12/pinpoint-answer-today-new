import type { NextPreview } from "@/lib/puzzles/data";
import { Countdown } from "@/components/shared/Countdown";

function toUnlockIso(dateIso: string) {
  return `${dateIso}T08:00:00.000Z`;
}

export function HomeNextUnlock({ preview }: { preview: NextPreview | null }) {
  if (!preview) {
    return null;
  }

  const targetIso = toUnlockIso(preview.isoDate);
  const targetLabel = `Puzzle ${preview.number} unlocks on ${preview.expectedDate} at GMT+8 16:00`;
  const headline = `When Does LinkedIn Pinpoint ${preview.number} Unlock?`;

  return (
    <section className="home-next-unlock">
      <div className="home-next-unlock-inner">
        <div className="home-next-unlock-heading">
          <h2 className="home-next-unlock-title">{headline}</h2>
          <p className="home-next-unlock-copy">
            {`Next unlock at ${preview.expectedDate} 16:00 (Asia/Shanghai). For Pinpoint, LinkedIn's daily schedule, this gives you the next reset at a glance. Times shown in your local time zone below.`}
          </p>
        </div>
        <Countdown targetIso={targetIso} targetLabel={targetLabel} />
      </div>
    </section>
  );
}
