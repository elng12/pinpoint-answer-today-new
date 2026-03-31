import Link from "next/link";
import { routes } from "@/lib/paths/routes";

type NavBarProps = {
  isDetailPage?: boolean;
};

export function NavBar({ isDetailPage = false }: NavBarProps) {
  const navLinks = isDetailPage
    ? [
        { label: "Today", href: routes.home },
        { label: "Pro Tips", href: routes.preview },
        { label: "Past Puzzles", href: routes.archive },
        { label: "Feedback", href: routes.contact },
      ]
    : [
        { label: "Today", href: routes.home },
        { label: "Pro Tips", href: routes.preview },
        { label: "Archive", href: routes.archive },
      ];

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link className="brand" href={routes.home}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/favicon/favicon-96x96.png"
            alt="Pinpoint Answer Today logo"
            className="brand-mark"
            width={22}
            height={22}
            decoding="async"
          />
          Pinpoint Answer Today
        </Link>

        <nav className="nav-links nav-links-desktop" aria-label="Primary navigation">
          {navLinks.map((link) => (
            <Link key={`${link.href}-${link.label}`} href={link.href} prefetch={false}>
              {link.label}
            </Link>
          ))}
        </nav>

        <details className="nav-menu">
          <summary className="nav-menu-trigger" aria-label="Open navigation menu">
            <span className="nav-menu-trigger-label">Menu</span>
            <span className="nav-menu-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </summary>
          <nav className="nav-menu-panel" aria-label="Mobile navigation">
            {navLinks.map((link) => (
              <Link key={`mobile-${link.href}-${link.label}`} href={link.href} prefetch={false}>
                {link.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
