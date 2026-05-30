import Link from "next/link";
import { routes } from "@/lib/paths/routes";

export function HomeCtaFooter({
  currentSlug,
}: {
  currentSlug: string;
}) {
  return (
    <section className="home-cta-footer">
      <div className="home-cta-inner">
        <p className="eyebrow" style={{ color: "rgba(255,255,255,0.82)" }}>
          Start your journey
        </p>
        <p className="home-cta-title">Check LinkedIn Pinpoint today, then save your Pinpoint today streak.</p>
        <p className="home-cta-copy">
          Use Pinpoint LinkedIn answer today notes, Pinpoint answer today LinkedIn recap,
          and Today&apos;s Pinpoint answer guide from one place.
        </p>
        <div className="button-row" style={{ justifyContent: "center" }}>
          <Link href={routes.detail(currentSlug)} className="button-secondary home-cta-primary" prefetch={false}>
            Reveal Today&apos;s Pinpoint Answer
          </Link>
          <Link href={routes.archive} className="button-secondary home-cta-secondary" prefetch={false}>
            Explore Pinpoint Today Archive
          </Link>
        </div>
      </div>
    </section>
  );
}
