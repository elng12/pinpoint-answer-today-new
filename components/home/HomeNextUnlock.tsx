import type { NextPreview } from "@/lib/puzzles/data";
import { Countdown } from "@/components/shared/Countdown";
import {
  formatPinpointUnlockTime,
  getPinpointUnlockIso,
  SHANGHAI_TIME_ZONE,
} from "@/lib/utils/pinpoint-unlock";

export function HomeNextUnlock({ preview }: { preview: NextPreview | null }) {
  if (!preview) {
    return null;
  }

  const shanghaiTime = formatPinpointUnlockTime(preview.isoDate, SHANGHAI_TIME_ZONE);
  const targetIso = getPinpointUnlockIso(preview.isoDate);
  const targetLabel = `Puzzle ${preview.number} unlocks on ${preview.expectedDate} at GMT+8 ${shanghaiTime}`;
  const headline = `When Does Pinpoint Today Puzzle ${preview.number} Unlock?`;

  return (
    <section className="home-next-unlock">
      <div className="home-next-unlock-inner">
        <div className="home-next-unlock-heading">
          <h2 className="home-next-unlock-title">{headline}</h2>
          <p className="home-next-unlock-copy">
            {`Next unlock at ${preview.expectedDate} ${shanghaiTime} (Asia/Shanghai). Pinpoint today timing follows LinkedIn's Los Angeles reset, so the Shanghai time will auto-shift with daylight saving. Times shown in your local time zone below.`}
          </p>
        </div>
        <Countdown targetIso={targetIso} targetLabel={targetLabel} />
      </div>
    </section>
  );
}
