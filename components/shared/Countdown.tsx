"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trackClientEvent } from "@/lib/analytics";

function getRemaining(targetIso: string) {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds };
}

export function Countdown({ targetLabel, targetIso }: { targetLabel: string; targetIso: string }) {
  const hasTrackedRef = useRef(false);
  const [remaining, setRemaining] = useState(() => getRemaining(targetIso));

  useEffect(() => {
    if (hasTrackedRef.current) {
      return;
    }

    trackClientEvent("countdown_view", {
      event_category: "engagement",
      event_label: targetLabel,
    });
    hasTrackedRef.current = true;
  }, [targetLabel]);

  useEffect(() => {
    setRemaining(getRemaining(targetIso));
    const timer = window.setInterval(() => {
      setRemaining(getRemaining(targetIso));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [targetIso]);

  const segments = useMemo(
    () => [
      {
        label: "Hours",
        value: String(remaining?.hours ?? 0).padStart(2, "0"),
      },
      {
        label: "Minutes",
        value: String(remaining?.minutes ?? 0).padStart(2, "0"),
      },
      {
        label: "Seconds",
        value: String(remaining?.seconds ?? 0).padStart(2, "0"),
      },
    ],
    [remaining],
  );

  const userTimeZone = useMemo(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const offsetMinutes = new Date().getTimezoneOffset();
      const sign = offsetMinutes > 0 ? "-" : "+";
      const absoluteMinutes = Math.abs(offsetMinutes);
      const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
      const minutes = String(absoluteMinutes % 60).padStart(2, "0");
      return `${tz} (UTC${sign}${hours}:${minutes})`;
    } catch {
      return null;
    }
  }, []);

  return (
    <div className="countdown-shell" role="timer" aria-live="polite">
      <div className="countdown-grid">
        {segments.map((segment) => (
          <div className="countdown-segment-card" key={segment.label}>
            <div className="countdown-segment-value">{segment.value}</div>
            <div className="countdown-segment-label">{segment.label}</div>
          </div>
        ))}
      </div>
      {userTimeZone ? (
        <p className="countdown-timezone">
          Your time zone: <span className="countdown-timezone-strong">{userTimeZone}</span>
        </p>
      ) : null}
      <p className="countdown-note">
        <span aria-hidden="true">💡</span>
        <span>{targetLabel}.</span>
      </p>
    </div>
  );
}
