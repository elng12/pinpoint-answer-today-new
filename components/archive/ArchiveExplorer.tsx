"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArchiveCard } from "@/components/archive/ArchiveCard";
import type { ArchiveGroup } from "@/lib/puzzles/data";
import { trackClientEvent } from "@/lib/analytics";

function normalizeValue(value: string) {
  return value.toLowerCase().trim();
}

function buildSearchText(groupLabel: string, item: ArchiveGroup["items"][number]) {
  return normalizeValue(
    [
      item.number,
      item.title,
      item.category,
      item.difficulty,
      item.shortSummary,
      groupLabel,
      ...item.clues,
    ].join(" "),
  );
}

async function fetchArchiveGroups() {
  const response = await fetch("/api/archive-groups", {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load archive groups.");
  }

  const payload = (await response.json()) as { groups: ArchiveGroup[] };
  return payload.groups;
}

export function ArchiveExplorer({
  initialGroups,
  totalCount,
  initialQuery = "",
}: {
  initialGroups: ArchiveGroup[];
  totalCount: number;
  initialQuery?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? initialQuery);
  const [allGroups, setAllGroups] = useState<ArchiveGroup[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const normalizedQuery = normalizeValue(query);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const activeGroups = allGroups ?? initialGroups;

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) {
      return activeGroups;
    }

    return activeGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => buildSearchText(group.label, item).includes(normalizedQuery)),
      }))
      .filter((group) => group.items.length > 0);
  }, [activeGroups, normalizedQuery]);

  const visibleCount = activeGroups.reduce((count, group) => count + group.items.length, 0);
  const hiddenCount = totalCount - visibleCount;

  const ensureAllGroups = async () => {
    if (allGroups || isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      const groups = await fetchArchiveGroups();
      setAllGroups(groups);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="stack">
      <section className="surface" style={{ padding: 28 }}>
        <div className="archive-search-row">
          <label className="archive-search-label" htmlFor="archive-search">
            Find a past puzzle
          </label>
          <div className="archive-search-controls">
            <input
              id="archive-search"
              name="archive-search"
              type="search"
              value={query}
              className="archive-search-input"
              placeholder="Search by puzzle number, clue, category, difficulty, or summary"
              onChange={(event) => handleQueryChange(event.target.value)}
              onFocus={() => {
                void ensureAllGroups();
              }}
              onBlur={() => {
                if (!normalizedQuery) {
                  return;
                }

                trackClientEvent("archive_search", {
                  event_category: "engagement",
                  event_label: normalizedQuery,
                  value: totalCount,
                });
              }}
            />
            {query ? (
              <button
                type="button"
                className="button-secondary archive-search-clear"
                onClick={() => handleQueryChange("")}
              >
                Clear
              </button>
            ) : null}
          </div>
          <p className="copy archive-search-copy">
            {normalizedQuery
              ? `Showing ${filteredGroups.reduce((count, group) => count + group.items.length, 0)} matching puzzle${filteredGroups.reduce((count, group) => count + group.items.length, 0) === 1 ? "" : "s"} for "${query}".`
              : "Start with a puzzle number, a clue word, a category, or a short summary phrase."}
          </p>
        </div>
      </section>

      {filteredGroups.length ? (
        <>
          {filteredGroups.map((group) => (
            <section key={group.label} className="surface" style={{ padding: 28 }}>
              <p className="eyebrow">{group.label}</p>
              <div className="grid" style={{ marginTop: 20 }}>
                {group.items.map((item) => (
                  <ArchiveCard key={item.slug} item={item} />
                ))}
              </div>
            </section>
          ))}
          {hiddenCount > 0 && (
            <div style={{ textAlign: "center", paddingTop: 8 }}>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  void ensureAllGroups();
                }}
                disabled={isLoading}
              >
                {isLoading
                  ? "Loading more puzzles..."
                  : `Load ${hiddenCount} more puzzle${hiddenCount === 1 ? "" : "s"}`}
              </button>
            </div>
          )}
        </>
      ) : (
        <section className="surface" style={{ padding: 28 }}>
          <p className="eyebrow">No Match Yet</p>
          <h2 className="section-title" style={{ fontSize: 28 }}>
            Try a puzzle number or one of the clue words
          </h2>
          <p className="copy">
            This archive only searches the English puzzle set in the new site. If you still cannot
            find the page, the entry probably has not been added to the registry yet.
          </p>
        </section>
      )}
    </div>
  );
}
