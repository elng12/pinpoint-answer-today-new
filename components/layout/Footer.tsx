"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FooterBadgeWall } from "@/components/layout/FooterBadgeWall";
import { routes } from "@/lib/paths/routes";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { footerBadges } from "@/lib/site/badges";

export function Footer({ recentEntries }: { recentEntries: ArchiveEntry[] }) {
  const pathname = usePathname();
  const isDetailPage = pathname.startsWith("/linkedin-pinpoint-answers/");
  const quickLinks = isDetailPage
    ? [
        { label: "Next puzzle", href: routes.preview },
        { label: "Archive", href: routes.archive },
        { label: "How it works", href: "/#faq" },
        { label: "Media & Featured In", href: routes.featured },
        { label: "About", href: routes.about },
      ]
    : [
        { label: "Next Pinpoint Preview", href: routes.preview },
        { label: "View All Pinpoint Answers and Solutions", href: routes.archive },
      ];
  const supportLinks = [
    { label: "Email Support", href: "mailto:support@pinpointanswertoday.app" },
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
                : "Fast daily answers, deeper puzzle explanations, and a cleaner English-only archive built for people who want today&apos;s solution without wading through legacy clutter."}
            </p>
          </div>

          <div className="footer-block">
            <h3 className="eyebrow">{isDetailPage ? "Recent answers" : "Recent 10 Pinpoint Answers"}</h3>
            <ul className="footer-link-list footer-link-list-compact">
              {recentEntries.map((entry) => (
                <li key={entry.slug}>
                  <Link href={routes.detail(entry.slug)}>{`LinkedIn Pinpoint #${entry.number}`}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-link-grid">
            <div className="footer-block">
              <h3 className="eyebrow">Quick Links</h3>
              <ul className="footer-link-list footer-link-list-compact">
                {quickLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer-block">
              <h3 className="eyebrow">Support</h3>
              <ul className="footer-link-list">
                {supportLinks.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("mailto:") ? (
                      <a href={link.href}>{link.label}</a>
                    ) : (
                      <Link href={link.href}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer-block">
              <h3 className="eyebrow">Legal &amp; Privacy</h3>
              <ul className="footer-link-list">
                {legalLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {isDetailPage ? null : <FooterBadgeWall badges={footerBadges} heading="Media & Featured In" />}
        <div className="footer-copyright">
          © 2026 Pinpoint Answer Today. All rights reserved. All names, trademarks, and registered marks belong to their respective owners.
        </div>
      </div>
    </footer>
  );
}
