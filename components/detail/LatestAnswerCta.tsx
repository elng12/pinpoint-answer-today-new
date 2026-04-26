import Link from "next/link";
import { routes } from "@/lib/paths/routes";

export type LatestAnswerCtaPuzzle = {
  number: number;
  slug: string;
};

export function LatestAnswerCta({
  currentSlug,
  latestPuzzle,
}: {
  currentSlug: string;
  latestPuzzle: LatestAnswerCtaPuzzle | null;
}) {
  if (!latestPuzzle || latestPuzzle.slug === currentSlug) {
    return null;
  }

  return (
    <section className="legacy-latest-answer-shell" aria-label="Latest published Pinpoint answer">
      <p className="legacy-latest-answer-kicker">Latest published answer</p>
      <p className="legacy-latest-answer-copy">
        {`Need today's live answer instead of this archived page? Jump straight to Puzzle #${latestPuzzle.number}.`}
      </p>
      <Link className="button-secondary" href={routes.detail(latestPuzzle.slug)}>
        {`View Latest Answer (#${latestPuzzle.number})`}
      </Link>
    </section>
  );
}
