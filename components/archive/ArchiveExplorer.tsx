"use client";

import { useMemo, useState } from "react";
import { ArchiveCard } from "@/components/archive/ArchiveCard";
import type { ArchiveGroup } from "@/lib/puzzles/data";
import { trackClientEvent } from "@/lib/analytics";

const INITIAL_LIMIT = 60;

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

export function ArchiveExplorer({ groups }: { groups: ArchiveGroup[] }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const normalizedQuery = normalizeValue(query);

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => buildSearchText(group.label, item).includes(normalizedQuery)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedQuery]);

  const totalCount = filteredGroups.reduce((count, group) => count + group.items.length, 0);

  const visibleGroups = useMemo(() => {
    if (normalizedQuery || showAll) {
      return filteredGroups;
    }
    let remaining = INITIAL_LIMIT;
    const result: ArchiveGroup[] = [];
    for (const group of filteredGroups) {
      if (remaining <= 0) break;
      const items = group.items.slice(0, remaining);
      result.push({ ...group, items });
      remaining -= items.length;
    }
    return result;
  }, [filteredGroups, normalizedQuery, showAll]);

  const visibleCount = visibleGroups.reduce((n, g) => n + g.items.length, 0);
  const hiddenCount = totalCount - visibleCount;

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
              onChange={(event) => setQuery(event.target.value)}
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
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            ) : null}
          </div>
          <p className="copy archive-search-copy">
            {normalizedQuery
              ? `Showing ${totalCount} matching puzzle${totalCount === 1 ? "" : "s"} for "${query}".`
              : "Start with a puzzle number, a clue word, a category, or a short summary phrase."}
          </p>
        </div>
      </section>

      {visibleGroups.length ? (
        <>
          {visibleGroups.map((group) => (
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
                onClick={() => setShowAll(true)}
              >
                Load {hiddenCount} more puzzle{hiddenCount === 1 ? "" : "s"}
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
