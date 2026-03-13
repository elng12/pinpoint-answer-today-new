import Link from "next/link";
import { routes } from "@/lib/paths/routes";

export function HomeCtaFooter({
  currentPuzzleNumber,
  currentSlug,
}: {
  currentPuzzleNumber: number;
  currentSlug: string;
}) {
  return (
    <section className="home-cta-footer">
      <div className="home-cta-inner">
        <p className="eyebrow" style={{ color: "rgba(255,255,255,0.82)" }}>
          Start your journey
        </p>
        <p className="home-cta-title">Start your journey to becoming a Pinpoint champion today.</p>
        <p className="home-cta-copy">
          Start with today&apos;s puzzle answer, then build confidence with the archive, preview
          drills, and cleaner clue-by-clue recaps.
        </p>
        <div className="button-row" style={{ justifyContent: "center" }}>
          <Link href={routes.detail(currentSlug)} className="button-secondary home-cta-primary" prefetch={false}>
            Reveal Today&apos;s Answer
          </Link>
          <Link href={routes.archive} className="button-secondary home-cta-secondary" prefetch={false}>
            Explore archive
          </Link>
        </div>
      </div>
    </section>
  );
}
