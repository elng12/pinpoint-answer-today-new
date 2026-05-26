"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { trackClientEvent } from "@/lib/analytics";

type AnswerRevealProps = {
  puzzleNumber: number;
  clues: string[];
  answer: string;
  category: string;
  detailHref?: string;
  hintMap?: Record<string, string>;
  showDetailLink?: boolean;
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

export function AnswerReveal({
  puzzleNumber,
  clues,
  answer,
  category,
  detailHref,
  hintMap,
  showDetailLink = true,
}: AnswerRevealProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeHint, setActiveHint] = useState<{ clue: string; text: string } | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const revealTipId = useId();
  const normalizedHints = useMemo(() => buildHintMap(hintMap), [hintMap]);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  const clearHint = () => {
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setActiveHint(null);
  };

  const getHintText = (clue: string) => {
    const normalizedClue = normalizeKey(clue);
    const directHint = normalizedHints[normalizedClue];
    const fallbackHint = `${clue} points back to ${category}.`;
    return directHint || fallbackHint;
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

  const handleRevealToggle = () => {
    setRevealed((value) => {
      const nextValue = !value;
      trackClientEvent(nextValue ? "reveal_click" : "hide_answer", {
        event_category: "engagement",
        event_label: `Puzzle ${puzzleNumber}`,
        value: puzzleNumber,
      });
      return nextValue;
    });
  };

  return (
    <div className="reveal-shell">
      <p className="reveal-tip" id={revealTipId}>
        Hover (desktop) or tap (mobile) each clue to see how it connects to the Pinpoint solution
      </p>

      <div className="reveal-clue-grid">
        {clues.map((clue, index) => (
          <button
            key={`${clue}-${index}`}
            type="button"
            className="reveal-clue-card"
            onClick={() => showHint(clue, { persist: true, track: true })}
            onMouseEnter={() => showHint(clue)}
            onMouseLeave={clearHint}
            onFocus={() => showHint(clue)}
            onBlur={clearHint}
            aria-describedby={revealTipId}
          >
            <span className="reveal-clue-index">{index + 1}</span>
            <span className="reveal-clue-word">{clue}</span>
          </button>
        ))}
      </div>

      {activeHint ? (
        <div className="reveal-hint-card">
          <p className="reveal-hint-kicker">Hint for {activeHint.clue}</p>
          <p className="reveal-hint-copy">{activeHint.text}</p>
        </div>
      ) : null}

      <div id="answer-reveal" className="reveal-answer-panel">
        <p className="sr-only">
          {revealed
            ? `LinkedIn Pinpoint ${puzzleNumber} solution: ${answer}. Shared connection: ${category}.`
            : `LinkedIn Pinpoint ${puzzleNumber} solution is hidden until you press the reveal button.`}
        </p>
        <p className="eyebrow">Pinpoint solution</p>
        <h3 className="reveal-answer-title">{revealed ? answer : `Pinpoint Answer for Puzzle ${puzzleNumber}`}</h3>
        <p className="reveal-answer-copy">
          {revealed
            ? ""
            : "Use the button below if you want today's Pinpoint answer. Pinpoint today answer logic stays below if you keep scrolling for the full explanation."}
        </p>
        <div className="button-row reveal-answer-actions">
          <button className="button-primary reveal-primary-button" type="button" onClick={handleRevealToggle}>
            {revealed ? "Hide the answer" : "Reveal Pinpoint answer"}
          </button>
          {showDetailLink && detailHref ? (
            <Link
              className="button-secondary reveal-secondary-button"
              href={detailHref}
              prefetch={false}
              onClick={() =>
                trackClientEvent("analysis_click", {
                  event_category: "engagement",
                  event_label: `Puzzle ${puzzleNumber}`,
                  value: puzzleNumber,
                })
              }
            >
              View Full Breakdown
            </Link>
          ) : null}
          {revealed ? (
            <button className="button-secondary reveal-secondary-button" type="button" onClick={handleCopy}>
              {copied ? "Copied" : "Copy Pinpoint answer"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
