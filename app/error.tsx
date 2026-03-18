"use client";

import Link from "next/link";
import { routes } from "@/lib/site/routes";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container" style={{ padding: "48px 0 72px" }}>
      <section className="surface" style={{ padding: 32, textAlign: "center" }}>
        <p className="eyebrow">Something went wrong</p>
        <h1 className="section-title">We could not load this page</h1>
        <p className="copy" style={{ margin: "12px auto 0", maxWidth: 680 }}>
          {
            "Try the page again. If the problem keeps happening, head back to the current answer or the archive while we sort it out."
          }
        </p>
        <div className="button-row" style={{ justifyContent: "center" }}>
          <button className="button-primary" type="button" onClick={reset}>
            Try again
          </button>
          <Link className="button-secondary" href={routes.home}>
            Go to today
          </Link>
        </div>
        {error.digest ? (
          <p className="muted-small" style={{ marginTop: 16 }}>
            Reference: {error.digest}
          </p>
        ) : null}
      </section>
    </main>
  );
}
