"use client";

import { useEffect, useState } from "react";
import { trackClientEvent } from "@/lib/analytics";

export function DetailShareButton({
  puzzleNumber,
  align = "start",
}: {
  puzzleNumber: number;
  align?: "start" | "center";
}) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = window.setTimeout(() => setMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [message]);

  const handleShare = async () => {
    const title = `Pinpoint Answer Today (#${puzzleNumber})`;
    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        trackClientEvent("share_click", {
          event_category: "engagement",
          event_label: `Puzzle ${puzzleNumber}`,
          value: puzzleNumber,
        });
        setMessage("Shared");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        trackClientEvent("share_copy", {
          event_category: "engagement",
          event_label: `Puzzle ${puzzleNumber}`,
          value: puzzleNumber,
        });
        setMessage("Link copied");
      }
    } catch {
      setMessage("Share unavailable");
    }
  };

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: align }}>
      <button className="button-secondary" type="button" onClick={handleShare}>
        <svg
          aria-hidden="true"
          className="legacy-share-icon"
          viewBox="0 0 512 512"
          width="16"
          height="16"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M503.691 189.836 327.687 37.851C312.281 24.546 288 35.347 288 56.015v80.053C127.371 137.907 0 170.1 0 322.326c0 61.441 39.581 122.309 83.333 154.132 13.653 9.931 33.111-2.533 28.077-18.631C66.066 312.814 132.917 274.316 288 272.085V360c0 20.7 24.3 31.453 39.687 18.164l176.004-152c11.071-9.562 11.086-26.753 0-36.328z"
          />
        </svg>
        Share this puzzle
      </button>
      {message ? <span className="muted-small">{message}</span> : null}
    </div>
  );
}
