import Link from "next/link";
import { routes } from "@/lib/paths/routes";
import { supportMailto } from "@/lib/site/config";

type FooterProps = {
  isDetailPage?: boolean;
};

export function Footer({ isDetailPage = false }: FooterProps) {
  const quickLinks = isDetailPage
    ? [
        { label: "Pro Tips", href: routes.preview },
        { label: "Archive", href: routes.archive },
        { label: "How it works", href: "/#faq" },
        { label: "About", href: routes.about },
      ]
    : [
        { label: "Pro Tips", href: routes.preview },
        { label: "Open Full Archive", href: routes.archive },
      ];
  const supportLinks = [
    { label: "Email Support", href: supportMailto },
    { label: "Contact & Feedback", href: routes.contact },
  ];
  const legalLinks = [
    { label: "Privacy Notice", href: routes.privacy },
    { label: "Terms of Use", href: routes.terms },
    { label: "Disclaimer", href: routes.disclaimer },
  ];

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid footer-grid-two-column">
          <div className="footer-block">
            <p className="eyebrow">{isDetailPage ? "Pinpoint Answer" : "Pinpoint Answer Today"}</p>
            <p className="footer-copy">
              {isDetailPage
                ? "A fan-built companion for the daily LinkedIn puzzle. Each Pinpoint answer comes with rapid verification, thoughtful analysis, Pinpoint answer notes, and strategy context, and every answer page is built independently from any organization."
                : "Built for people who want LinkedIn Pinpoint answer today, Pinpoint today archive notes, Pinpoint today clue checks, and clearer explanations without wading through old clutter."}
            </p>
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
                  <li key={`${link.label}-${link.href}`}>
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
          © {new Date().getFullYear()} {isDetailPage ? "Pinpoint Answer" : "Pinpoint Answer Today"}. All rights reserved. All names, trademarks, and registered marks belong to their respective owners.
        </div>
      </div>
    </footer>
  );
}
