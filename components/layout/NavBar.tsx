import Image from "next/image";
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
          <Image
            src="/favicon/favicon.svg"
            alt="Pinpoint Answer Today logo"
            className="brand-mark"
            aria-hidden
            width={22}
            height={22}
          />
          Pinpoint Answer Today
        </Link>
        <nav className="nav-links">
          {navLinks.map((link) => (
            <Link key={`${link.href}-${link.label}`} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
