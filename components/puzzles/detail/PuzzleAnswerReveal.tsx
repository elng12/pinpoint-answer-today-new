"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { trackClientEvent } from "@/lib/site/analytics";

type PuzzleAnswerRevealProps = {
  puzzleNumber: number;
  clues: string[];
  answer: string;
  category: string;
  hintMap?: Record<string, string>;
  spoilerHintMap?: Record<string, string>;
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildHintMap(hintMap?: Record<string, string>) {
  return Object.entries(hintMap ?? {}).reduce<Record<string, string>>((accumulator, [key, value]) => {
    const cleanKey = normalizeKey(key);
    const cleanValue = value.trim();
    if (cleanKey && cleanValue) {
      accumulator[cleanKey] = cleanValue;
    }
    return accumulator;
  }, {});
}

export function PuzzleAnswerReveal({
  puzzleNumber,
  clues,
  answer,
  category,
  hintMap,
  spoilerHintMap,
}: PuzzleAnswerRevealProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeHint, setActiveHint] = useState<{ clue: string; text: string } | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const revealTipId = useId();

  const normalizedHints = useMemo(() => buildHintMap(hintMap), [hintMap]);
  const normalizedSpoilerHints = useMemo(() => buildHintMap(spoilerHintMap), [spoilerHintMap]);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  const handleRevealToggle = () => {
    clearHint();
    setRevealed((current) => {
      const nextValue = !current;
      trackClientEvent(nextValue ? "reveal_click" : "hide_answer", {
        event_category: "engagement",
        event_label: `Puzzle ${puzzleNumber}`,
        value: puzzleNumber,
      });
      return nextValue;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      trackClientEvent("copy_answer", {
        event_category: "engagement",
        event_label: `Puzzle ${puzzleNumber}`,
        value: puzzleNumber,
      });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const clearHint = () => {
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setActiveHint(null);
  };

  const getHintText = (clue: string) => {
    const normalizedClue = normalizeKey(clue);
    const safeHint = normalizedSpoilerHints[normalizedClue];
    const directHint = normalizedHints[normalizedClue];
    const safeFallback =
      "Stay broad for now. This clue matters, but the full connection appears after the reveal.";
    const revealedFallback = `${clue} fits the same pattern that leads to ${category}.`;
    if (!revealed) {
      return safeHint || safeFallback;
    }
    return directHint || revealedFallback;
  };

  const showHint = (
    clue: string,
    options?: {
      persist?: boolean;
      track?: boolean;
    },
  ) => {
    const hint = getHintText(clue);

    if (options?.track) {
      trackClientEvent("clue_hint_click", {
        event_category: "engagement",
        event_label: `${clue} · Puzzle ${puzzleNumber}`,
        value: puzzleNumber,
      });
    }

    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }

    setActiveHint({
      clue,
      text: revealed ? `${hint} Shared connection: ${category}.` : hint,
    });

    if (options?.persist) {
      hintTimerRef.current = window.setTimeout(() => {
        setActiveHint(null);
        hintTimerRef.current = null;
      }, 4000);
    }
  };

  return (
    <section className="legacy-reveal-shell" aria-labelledby="pinpoint-answer-title">
      <p className="legacy-reveal-tip" id={revealTipId}>
        Hover (desktop) or tap (mobile) each clue before you reveal the Pinpoint answer
      </p>

      <div className="legacy-reveal-clue-grid">
        {clues.map((clue, index) => (
          <button
            key={`${clue}-${index}`}
            type="button"
            className="legacy-reveal-clue-card"
            onClick={() => showHint(clue, { persist: true, track: true })}
            onMouseEnter={() => showHint(clue)}
            onMouseLeave={clearHint}
            onFocus={() => showHint(clue)}
            onBlur={clearHint}
            aria-describedby={revealTipId}
          >
            <span className="legacy-reveal-clue-index">#{index + 1}</span>
            <span className="legacy-reveal-clue-word">{clue}</span>
          </button>
        ))}
      </div>

      <div role="status" aria-live="polite" aria-atomic="true">
        {activeHint ? (
          <div className="legacy-reveal-hint-card">
            <p className="legacy-reveal-hint-kicker">Hint for {activeHint.clue}</p>
            <p className="legacy-reveal-hint-copy">{activeHint.text}</p>
          </div>
        ) : null}
      </div>

      <div className="legacy-answer-panel" id="answer-reveal" aria-labelledby="pinpoint-answer-title">
        <h2 className="legacy-answer-label" id="pinpoint-answer-title">
          {`Pinpoint Answer for LinkedIn Pinpoint ${puzzleNumber}`}
        </h2>
        {revealed ? (
          <p className="legacy-answer-title" aria-live="polite">
            {answer}
          </p>
        ) : null}
        <div className="legacy-answer-actions">
          <button className="button-primary legacy-answer-button" type="button" onClick={handleRevealToggle}>
            {revealed ? "Hide Pinpoint Answer" : "Reveal Pinpoint Answer"}
          </button>
          {revealed ? (
            <button className="button-secondary legacy-answer-button" type="button" onClick={handleCopy}>
              {copied ? "Copied" : "Copy Pinpoint Answer"}
            </button>
          ) : null}
        </div>
        <p className="legacy-answer-note">
          <span aria-hidden="true">ℹ️</span>
          <span>Detailed Pinpoint answer breakdown continues just below - keep scrolling</span>
        </p>
      </div>
    </section>
  );
}
