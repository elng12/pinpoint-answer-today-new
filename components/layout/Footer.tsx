import Link from "next/link";
import { routes } from "@/lib/paths/routes";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { supportMailto } from "@/lib/site/config";

type FooterProps = {
  recentEntries: ArchiveEntry[];
  isDetailPage?: boolean;
};

export function Footer({ recentEntries, isDetailPage = false }: FooterProps) {
  const quickLinks = isDetailPage
    ? [
        { label: "Next puzzle", href: routes.preview },
        { label: "Archive", href: routes.archive },
        { label: "How it works", href: "/#faq" },
        { label: "About", href: routes.about },
      ]
    : [
        { label: "Next Pinpoint Preview", href: routes.preview },
        { label: "View All Pinpoint Answers and Solutions", href: routes.archive },
      ];
  const supportLinks = [
    { label: "Email Support", href: supportMailto },
    { label: "Contact", href: routes.contact },
    { label: "Share Feedback", href: routes.contact },
    { label: "Request a Feature", href: routes.contact },
  ];
  const legalLinks = [
    { label: "Privacy Notice", href: routes.privacy },
    { label: "Terms of Use", href: routes.terms },
    { label: "Disclaimer", href: routes.disclaimer },
  ];

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-block">
            <p className="eyebrow">Pinpoint Answer Today</p>
            <p className="footer-copy">
              {isDetailPage
                ? "Pinpoint Answer Today is a fan-built companion for the daily LinkedIn puzzle. We deliver rapid solutions, thoughtful analysis, and strategy guides while operating independently from any organization."
                : "Fast daily answers, deeper puzzle explanations, and a cleaner English-only archive built for people who want today's solution without wading through legacy clutter."}
            </p>
          </div>

          <div className="footer-block">
            <p className="eyebrow">{isDetailPage ? "Recent answers" : "Recent Pinpoint Answers"}</p>
            <ul className="footer-link-list footer-link-list-compact">
              {recentEntries.map((entry) => (
                <li key={entry.slug}>
                  <Link href={routes.detail(entry.slug)} prefetch={false}>{`LinkedIn Pinpoint #${entry.number}`}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-link-grid">
            <div className="footer-block">
              <p className="eyebrow">Quick Links</p>
              <ul className="footer-link-list footer-link-list-compact">
                {quickLinks.map((link) => (
                  <li key={`${link.label}-${link.href}`}>
                    <Link href={link.href} prefetch={false}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer-block">
              <p className="eyebrow">Support</p>
              <ul className="footer-link-list">
                {supportLinks.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("mailto:") ? (
                      <a href={link.href}>{link.label}</a>
                    ) : (
                      <Link href={link.href} prefetch={false}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer-block">
              <p className="eyebrow">Legal &amp; Privacy</p>
              <ul className="footer-link-list">
                {legalLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} prefetch={false}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-copyright">
          © {new Date().getFullYear()} Pinpoint Answer Today. All rights reserved. All names, trademarks, and registered marks belong to their respective owners.
        </div>
      </div>
    </footer>
  );
}
