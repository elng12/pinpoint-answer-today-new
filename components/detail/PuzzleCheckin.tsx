"use client";

import { useEffect, useMemo, useState } from "react";

function getStorageKey(puzzleNumber: number): string {
  return `pinpoint_solved_${puzzleNumber}`;
}

function getSolvedCount(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  let count = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("pinpoint_solved_") && localStorage.getItem(key) === "1") {
      count += 1;
    }
  }
  return count;
}

export function PuzzleCheckin({ puzzleNumber }: { puzzleNumber: number }) {
  const [ready, setReady] = useState(false);
  const [solved, setSolved] = useState(false);
  const [solvedCount, setSolvedCount] = useState(0);
  const storageKey = useMemo(() => getStorageKey(puzzleNumber), [puzzleNumber]);

  useEffect(() => {
    try {
      setSolved(localStorage.getItem(storageKey) === "1");
      setSolvedCount(getSolvedCount());
    } finally {
      setReady(true);
    }
  }, [storageKey]);

  if (!ready) {
    return null;
  }

  const toggleSolved = () => {
    if (solved) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, "1");
    }

    setSolved((current) => !current);
    setSolvedCount(getSolvedCount());
  };

  return (
    <section className="legacy-checkin-card" aria-label="Puzzle check-in">
      <div>
        <p className="legacy-checkin-title">Puzzle check-in</p>
        <p className="muted-small">
          {`Save your solve status on this device. Checked in: ${solvedCount} puzzle${solvedCount === 1 ? "" : "s"}.`}
        </p>
      </div>
      <button
        className={`button-secondary legacy-checkin-button${solved ? " legacy-checkin-button-active" : ""}`}
        onClick={toggleSolved}
        type="button"
      >
        {solved ? "Marked as solved" : "Mark as solved"}
      </button>
    </section>
  );
}
