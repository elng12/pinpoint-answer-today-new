"use client";

import { useEffect, useRef, useState } from "react";
import {
  getScrollDepthPercent,
  trackClientEvent,
  trackClientEventWhenReady,
} from "@/lib/analytics";

type PuzzleAnswerRevealProps = {
  puzzleNumber: number;
  clues: string[];
  answer: string;
  detailMode?: "full" | "short";
  defaultRevealed?: boolean;
  panelTitle?: string;
  detailNote?: string;
  trackFaqSectionView?: boolean;
};

export function PuzzleAnswerReveal({
  puzzleNumber,
  clues,
  answer,
  detailMode = "full",
  defaultRevealed = false,
  panelTitle,
  detailNote,
  trackFaqSectionView = false,
}: PuzzleAnswerRevealProps) {
  const [revealed, setRevealed] = useState(defaultRevealed);
  const [copied, setCopied] = useState(false);
  const hasTrackedFaqSectionRef = useRef(false);

  useEffect(() => {
    if (!trackFaqSectionView || hasTrackedFaqSectionRef.current) {
      return;
    }

    let observer: IntersectionObserver | null = null;
    let retryTimer: number | null = null;

    const attachObserver = () => {
      if (hasTrackedFaqSectionRef.current) {
        return;
      }

      const faqSection = document.getElementById("faq");
      if (!faqSection) {
        retryTimer = window.setTimeout(attachObserver, 250);
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry?.isIntersecting || hasTrackedFaqSectionRef.current) {
            return;
          }

          hasTrackedFaqSectionRef.current = true;
          trackClientEventWhenReady("faq_section_viewed", {
            event_category: "engagement",
            event_label: `Puzzle ${puzzleNumber}`,
            puzzle_number: puzzleNumber,
            detail_mode: detailMode,
            source_slot: "detail_faq_section",
            scroll_depth_percent: getScrollDepthPercent(),
            value: puzzleNumber,
          });
          observer?.disconnect();
        },
        { threshold: 0.25 },
      );

      observer.observe(faqSection);
    };

    attachObserver();

    return () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      observer?.disconnect();
    };
  }, [detailMode, puzzleNumber, trackFaqSectionView]);

  const handleRevealToggle = () => {
    setRevealed((current) => {
      const nextValue = !current;
      const scrollDepthPercent = getScrollDepthPercent();

      trackClientEvent(nextValue ? "reveal_click" : "hide_answer", {
        event_category: "engagement",
        event_label: `Puzzle ${puzzleNumber}`,
        value: puzzleNumber,
      });

      if (nextValue) {
        trackClientEventWhenReady("answer_revealed", {
          event_category: "engagement",
          event_label: `Puzzle ${puzzleNumber}`,
          puzzle_number: puzzleNumber,
          detail_mode: detailMode,
          source_slot: "detail_answer_panel",
          scroll_depth_percent: scrollDepthPercent,
          value: puzzleNumber,
        });
      }

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

  const fallbackDetailNote =
    detailMode === "short"
      ? `Short Pinpoint ${puzzleNumber} answer reasoning continues just below with LinkedIn context.`
      : `Pinpoint ${puzzleNumber} answer reasoning continues just below with LinkedIn context.`;
  const answerPanelTitle = panelTitle ?? `Pinpoint ${puzzleNumber} Answer`;
  const answerPanelNote = detailNote ?? fallbackDetailNote;
  const cluePath = clues.join(" ");
  const hasMultiWordClue = clues.some((clue) => {
    const clueTokens = clue
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return clueTokens.length > 1;
  });
  const cluePathNote = hasMultiWordClue
    ? `LinkedIn Pinpoint clue order: ${cluePath}. Read the full order before the reveal.`
    : `LinkedIn Pinpoint clue order: ${cluePath}. Read ${cluePath} before the reveal.`;

  return (
    <section className="legacy-reveal-shell" aria-labelledby="pinpoint-clues-title">
      <h2 className="legacy-clues-title" id="pinpoint-clues-title">
        {`LinkedIn Pinpoint ${puzzleNumber} Answer Clues`}
      </h2>
      <ol className="legacy-reveal-clue-grid" aria-label={`Pinpoint ${puzzleNumber} clue order`}>
        {clues.map((clue, index) => (
          <li
            key={`${clue}-${index}`}
            className="legacy-reveal-clue-card"
          >
            <span className="legacy-reveal-clue-index">#{index + 1}</span>
            <span className="legacy-reveal-clue-word">{clue}</span>
          </li>
        ))}
      </ol>
      <p className="legacy-clue-path-note">{cluePathNote}</p>

      <div className="legacy-answer-panel" id="answer-reveal" aria-labelledby="pinpoint-answer-title">
        <h2 className="legacy-answer-label" id="pinpoint-answer-title">
          {answerPanelTitle}
        </h2>
        <p
          className={`legacy-answer-title${revealed ? " legacy-answer-title--visible" : " legacy-answer-title--hidden"}`}
          aria-live="polite"
          aria-hidden={!revealed}
        >
          {answer}
        </p>
        <div className="legacy-answer-actions">
          <button className="button-primary legacy-answer-button" type="button" onClick={handleRevealToggle}>
            {revealed ? "Hide Pinpoint answer" : "Reveal Pinpoint answer"}
          </button>
          {revealed ? (
            <button className="button-secondary legacy-answer-button" type="button" onClick={handleCopy}>
              {copied ? "Copied" : "Copy Pinpoint answer"}
            </button>
          ) : null}
        </div>
        <p className="legacy-answer-note">
          <span aria-hidden="true">ℹ️</span>
          <span>{answerPanelNote}</span>
        </p>
      </div>
    </section>
  );
}
