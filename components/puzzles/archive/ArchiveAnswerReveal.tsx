"use client";

import { useState } from "react";

export function ArchiveAnswerReveal({ answer }: { answer: string }) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return <p className="recent-answer-answer archive-answer-reveal">Answer: {answer}</p>;
  }

  return (
    <button
      type="button"
      className="archive-answer-spoiler-btn"
      onClick={() => setRevealed(true)}
    >
      Tap to reveal today&apos;s answer
    </button>
  );
}
