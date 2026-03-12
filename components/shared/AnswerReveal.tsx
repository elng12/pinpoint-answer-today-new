"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

  const normalizedHints = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(hintMap ?? {}).forEach(([key, value]) => {
      const cleanKey = normalizeKey(key);
      const cleanValue = value.trim();
      if (cleanKey && cleanValue) {
        map[cleanKey] = cleanValue;
      }
    });
    return map;
  }, [hintMap]);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

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

  const handleClueClick = (clue: string) => {
    const normalizedClue = normalizeKey(clue);
    const directHint = normalizedHints[normalizedClue];
    const fallbackHint = `${clue} points back to ${category}.`;
    const hint = directHint || fallbackHint;

    trackClientEvent("clue_hint_click", {
      event_category: "engagement",
      event_label: `${clue} · Puzzle ${puzzleNumber}`,
      value: puzzleNumber,
    });

    setActiveHint({
      clue,
      text: revealed ? `${hint} Shared connection: ${category}.` : hint,
    });

    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
    }

    hintTimerRef.current = window.setTimeout(() => {
      setActiveHint(null);
      hintTimerRef.current = null;
    }, 4000);
  };

  return (
    <div className="reveal-shell">
      <p className="reveal-tip">
        Hover (desktop) or tap (mobile) each clue to see how it connects to the answer
      </p>

      <div className="reveal-clue-grid">
        {clues.map((clue, index) => (
          <button
            key={`${clue}-${index}`}
            type="button"
            className="reveal-clue-card"
            onClick={() => handleClueClick(clue)}
            aria-label={`Clue ${index + 1}: ${clue}`}
            title={normalizedHints[normalizeKey(clue)] || `${clue} points back to ${category}.`}
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
          LinkedIn Pinpoint {puzzleNumber} answer: {answer}. Shared connection: {category}.
        </p>
        <p className="eyebrow">Answer</p>
        <h3 className="reveal-answer-title">
          {revealed ? answer : `LinkedIn Pinpoint ${puzzleNumber} Answer:`}
        </h3>
        <p className="reveal-answer-copy">
          {revealed
            ? ""
            : "Use the button below if you want the answer now. If you prefer context first, keep scrolling and read the full explanation."}
        </p>
        <div className="button-row reveal-answer-actions">
          <button className="button-primary reveal-primary-button" type="button" onClick={handleRevealToggle}>
            {revealed ? "Hide the answer" : "Reveal Pinpoint Answer Today"}
          </button>
          {showDetailLink && detailHref ? (
            <Link
              className="button-secondary reveal-secondary-button"
              href={detailHref}
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
              {copied ? "Copied" : "Copy answer"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
