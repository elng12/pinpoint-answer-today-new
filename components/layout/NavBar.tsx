import Link from "next/link";
import { routes } from "@/lib/paths/routes";

type NavBarProps = {
  isDetailPage?: boolean;
};

export function NavBar({ isDetailPage = false }: NavBarProps) {
  const navLinks = isDetailPage
    ? [
        { label: "Today", href: routes.home },
        { label: "Next puzzle", href: routes.preview },
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
            src="/favicon/favicon.svg"
            alt=""
            className="brand-mark"
            aria-hidden
            width={22}
            height={22}
            decoding="async"
          />
          Pinpoint Answer Today
        </Link>
        <nav className="nav-links">
          {navLinks.map((link) => (
            <Link key={`${link.href}-${link.label}`} href={link.href} prefetch={false}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
