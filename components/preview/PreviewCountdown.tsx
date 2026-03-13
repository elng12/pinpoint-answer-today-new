"use client";

import { useEffect, useState } from "react";

type Props = {
  isoDate: string;
  puzzleNumber: number;
};

type TimeLeft = {
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
};

const EMPTY_TIME_LEFT: TimeLeft = {
  hours: 0,
  minutes: 0,
  seconds: 0,
  expired: false,
};

function calcTimeLeft(targetIso: string): TimeLeft {
  const target = new Date(`${targetIso}T03:00:00Z`); // ~midnight PT
  const diff = target.getTime() - Date.now();

  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  const totalSeconds = Math.floor(diff / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: false,
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatUnlockLabel(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(`${isoDate}T03:00:00Z`));
}

export function PreviewCountdown({ isoDate, puzzleNumber }: Props) {
  const [time, setTime] = useState<TimeLeft>(EMPTY_TIME_LEFT);
  const [unlockLabel, setUnlockLabel] = useState("");

  useEffect(() => {
    setTime(calcTimeLeft(isoDate));
    setUnlockLabel(formatUnlockLabel(isoDate));
    const id = setInterval(() => {
      setTime(calcTimeLeft(isoDate));
    }, 1000);
    return () => clearInterval(id);
  }, [isoDate]);

  return (
    <section className="surface" style={{ padding: 32, textAlign: "center" }}>
      <p className="eyebrow">Countdown</p>
      <h2 className="section-title" style={{ marginTop: 8 }}>
        LinkedIn Pinpoint #{puzzleNumber} Unlocks In
      </h2>

      {time.expired ? (
        <p className="copy" style={{ marginTop: 16, fontWeight: 600 }}>
          The puzzle may already be live — check the archive for the latest answer.
        </p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 16,
              marginTop: 24,
            }}
          >
            {[
              { label: "Hours", value: time.hours },
              { label: "Minutes", value: time.minutes },
              { label: "Seconds", value: time.seconds },
            ].map(({ label, value }) => (
              <div className="card" key={label} style={{ minWidth: 80, textAlign: "center" }}>
                <p
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    lineHeight: 1,
                    margin: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pad(value)}
                </p>
                <p className="eyebrow" style={{ marginTop: 8 }}>
                  {label}
                </p>
              </div>
            ))}
          </div>
          <p className="copy" style={{ marginTop: 16 }}>
            Expected unlock: {unlockLabel}
          </p>
        </>
      )}
    </section>
  );
}
