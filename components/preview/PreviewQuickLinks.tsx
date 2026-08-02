import Link from "next/link";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

export function PreviewQuickLinks({ latestEntries }: { latestEntries: ArchiveEntry[] }) {
  const latest = latestEntries[0];
  const recent = latestEntries.slice(0, 6);

  return (
    <section className="surface" style={{ padding: 32 }}>
      <p className="eyebrow" style={{ textAlign: "center" }}>Quick Links</p>
      <h2 className="section-title" style={{ textAlign: "center" }}>Useful links while you wait</h2>
      <div className="button-row" style={{ justifyContent: "center" }}>
        <Link className="button-primary" href={routes.archive}>
          Browse the archive
        </Link>
        {latest ? (
          <Link className="button-secondary" href={routes.detail(latest.slug)}>
            Open latest published answer
          </Link>
        ) : null}
        <Link className="button-secondary" href={routes.contact}>
          Contact us
        </Link>
      </div>

      {recent.length > 0 ? (
        <div style={{ marginTop: 28 }}>
          <p className="eyebrow" style={{ textAlign: "center" }}>Recent Published Answers</p>
          <p className="copy" style={{ marginTop: 4, marginBottom: 16, textAlign: "center" }}>
            Published entries from the archive. Spoiler-safe: clue words are shown, answers are not.
          </p>
          <div className="grid grid-2">
            {recent.map((entry) => (
              <Link
                key={entry.slug}
                href={routes.detail(entry.slug)}
                className="card"
                style={{ textDecoration: "none", display: "block" }}
              >
                <p className="eyebrow">Pinpoint #{entry.number}</p>
                <p className="copy" style={{ marginTop: 4, fontWeight: 600 }}>
                  {entry.clues.join(", ")}
                </p>
                <p className="copy" style={{ marginTop: 4, fontSize: "0.85em", opacity: 0.7 }}>
                  {entry.date}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
