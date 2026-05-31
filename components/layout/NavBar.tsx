import Link from "next/link";
import { routes } from "@/lib/paths/routes";

type NavBarProps = {
  isDetailPage?: boolean;
};

type NavLink = {
  label: string;
  href: string;
  external?: boolean;
};

function NavItem({ link, mobile = false }: { link: NavLink; mobile?: boolean }) {
  const keyPrefix = mobile ? "mobile-" : "";

  if (link.external) {
    return (
      <a key={`${keyPrefix}${link.href}-${link.label}`} href={link.href} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
    );
  }

  return (
    <Link key={`${keyPrefix}${link.href}-${link.label}`} href={link.href} prefetch={false}>
      {link.label}
    </Link>
  );
}

export function NavBar({ isDetailPage = false }: NavBarProps) {
  const brandLabel = isDetailPage ? "Pinpoint Answer" : "Pinpoint Answer Today";
  const patchesAnswersLink: NavLink = {
    label: "Patches Answers",
    href: "https://patchesanswertoday.com/",
    external: true,
  };
  const navLinks: NavLink[] = isDetailPage
    ? [
        { label: "Today", href: routes.home },
        { label: "Pro Tips", href: routes.preview },
        { label: "Past Puzzles", href: routes.archive },
        { label: "Feedback", href: routes.contact },
        patchesAnswersLink,
      ]
    : [
        { label: "Today", href: routes.home },
        { label: "Pro Tips", href: routes.preview },
        { label: "Archive", href: routes.archive },
        patchesAnswersLink,
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
          {brandLabel}
        </Link>

        <nav className="nav-links nav-links-desktop" aria-label="Primary navigation">
          {navLinks.map((link) => (
            <NavItem key={`${link.href}-${link.label}`} link={link} />
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
              <NavItem key={`mobile-${link.href}-${link.label}`} link={link} mobile />
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
