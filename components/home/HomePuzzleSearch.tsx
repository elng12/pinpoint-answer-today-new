"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackClientEvent } from "@/lib/analytics";

function buildSlug(puzzleNumber: number) {
  return `/linkedin-pinpoint-answers/pinpoint-answer-${puzzleNumber}`;
}

export function HomePuzzleSearch({
  availablePuzzleNumbers,
  popularPuzzleNumbers,
}: {
  availablePuzzleNumbers: number[];
  popularPuzzleNumbers: number[];
}) {
  const availableNumbers = new Set(availablePuzzleNumbers);
  return (
    <HomePuzzleSearchInner
      popularPuzzleNumbers={popularPuzzleNumbers}
      availableNumbers={availableNumbers}
    />
  );
}

function HomePuzzleSearchInner({
  popularPuzzleNumbers,
  availableNumbers,
}: {
  popularPuzzleNumbers: number[];
  availableNumbers: Set<number>;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  return (
    <section className="surface" style={{ padding: 32 }}>
      <div className="home-search-heading">
        <p className="eyebrow">Historical answers</p>
        <h2 className="section-title">Search past answers by number</h2>
        <p className="copy">
          Looking for boards like #{popularPuzzleNumbers[0] ?? 678} or #{popularPuzzleNumbers[1] ?? 641}?
          Enter a puzzle number to jump straight into the full answer page, clue recap, and walkthrough.
        </p>
      </div>
      <form
        className="home-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          const numeric = Number.parseInt(value.match(/\d+/)?.[0] ?? "", 10);
          if (!Number.isFinite(numeric) || numeric <= 0) {
            setError("Enter a puzzle number such as 678 or 641.");
            return;
          }

          if (!availableNumbers.has(numeric)) {
            setError("This number is not in the imported archive yet.");
            return;
          }

          setError("");
          trackClientEvent("search_by_number", {
            event_category: "engagement",
            event_label: `Puzzle ${numeric}`,
            value: numeric,
          });
          router.push(buildSlug(numeric));
        }}
      >
        <input
          type="search"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) {
              setError("");
            }
          }}
          placeholder="e.g. 678 or 641"
          className="home-search-input"
        />
        <button type="submit" className="button-primary">
          View Answer
        </button>
      </form>
      {error ? <p className="home-search-error">{error}</p> : null}
      <p className="muted-small" style={{ marginTop: 16 }}>
        Popular lookups:{" "}
        {popularPuzzleNumbers.slice(0, 6).map((number, index) => (
          <span key={number}>
            <Link
              href={buildSlug(number)}
              onClick={() =>
                trackClientEvent("search_by_number", {
                  event_category: "engagement",
                  event_label: `Popular puzzle ${number}`,
                  value: number,
                })
              }
              className="home-inline-link"
            >
              #{number}
            </Link>
            {index < Math.min(popularPuzzleNumbers.length, 6) - 1 ? " · " : ""}
          </span>
        ))}
      </p>
    </section>
  );
}
