import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { NavBar } from "@/components/layout/NavBar";
import { routes } from "@/lib/paths/routes";
import { getRecentEntries } from "@/lib/puzzles/data";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const recentEntries = await getRecentEntries(5);

  return (
    <>
      <NavBar />
      <main className="container" style={{ padding: "48px 0 72px" }}>
        <section className="surface" style={{ padding: 32, textAlign: "center" }}>
          <p className="eyebrow">404</p>
          <h1 className="section-title">This Pinpoint page is missing</h1>
          <p className="copy" style={{ margin: "12px auto 0", maxWidth: 640 }}>
            {
              "The page may have moved, the puzzle number may not exist yet, or the link may be outdated. You can jump back to the current answer or browse the archive instead."
            }
          </p>
          <div className="button-row" style={{ justifyContent: "center" }}>
            <Link className="button-primary" href={routes.home}>
              Go to today
            </Link>
            <Link className="button-secondary" href={routes.archive}>
              Browse archive
            </Link>
          </div>
        </section>
      </main>
      <Footer recentEntries={recentEntries} />
    </>
  );
}
