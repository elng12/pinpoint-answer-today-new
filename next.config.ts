import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Actual locales from the old site (src/i18n.config.ts: en, pt-BR, fr, de)
    // Must be kept for at least 1 year to preserve SEO link equity.
    // Added: 2026-03-12
    const locales = ["en", "pt-BR", "fr", "de"];

    const localeRedirects = locales.flatMap((locale) => [
      // Locale homepage: /en → /
      {
        source: `/${locale}`,
        destination: "/",
        permanent: true,
      },
      // Puzzle detail pages: /en/linkedin-pinpoint-answers/pinpoint-answer-678 → /linkedin-pinpoint-answers/pinpoint-answer-678
      {
        source: `/${locale}/linkedin-pinpoint-answers/:slug`,
        destination: "/linkedin-pinpoint-answers/:slug",
        permanent: true,
      },
      // Locale archive alias: /en/linkedin-pinpoint-answers → /puzzles (new site has no bare list at this path)
      {
        source: `/${locale}/linkedin-pinpoint-answers`,
        destination: "/puzzles",
        permanent: true,
      },
      // Puzzles archive: /en/puzzles → /puzzles
      {
        source: `/${locale}/puzzles`,
        destination: "/puzzles",
        permanent: true,
      },
      // Locale numeric puzzle pages first normalize to the English legacy alias,
      // then the app validates whether that puzzle number really exists.
      {
        source: `/${locale}/puzzles/:number(\\d+)`,
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number",
        permanent: true,
      },
      // Locale-root puzzle alias: /en/pinpoint-answer-678 → /linkedin-pinpoint-answers/pinpoint-answer-678
      {
        source: `/${locale}/pinpoint-answer-:number(\\d+)`,
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number",
        permanent: true,
      },
      // Dynamic today alias keeps its own stable URL, then resolves to the current live detail page.
      {
        source: `/${locale}/pinpoint/today`,
        destination: "/pinpoint/today",
        permanent: true,
      },
      // Legacy pinpoint archive alias
      {
        source: `/${locale}/pinpoint/archive`,
        destination: "/puzzles",
        permanent: true,
      },
      // Date aliases keep a single English hop so the app can decide whether a matching detail page exists.
      {
        source: `/${locale}/pinpoint/:date(\\d{4}-\\d{2}-\\d{2})`,
        destination: "/pinpoint/:date",
        permanent: true,
      },
      // Older "number-analysis" aliases still point at the canonical detail page when the number exists.
      {
        source: `/${locale}/pinpoint/:number(\\d+)-analysis`,
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number",
        permanent: true,
      },
      // Preview page
      {
        source: `/${locale}/next-pinpoint-preview`,
        destination: "/next-pinpoint-preview",
        permanent: true,
      },
      // Feedback → contact-us (PRD §19: /feedback merged into /contact-us)
      {
        source: `/${locale}/feedback`,
        destination: "/contact-us",
        permanent: true,
      },
      // Featured → about-us (acts as the best trust-page substitute after cutover)
      {
        source: `/${locale}/featured`,
        destination: "/about-us",
        permanent: true,
      },
      // Static trust pages
      {
        source: `/${locale}/about-us`,
        destination: "/about-us",
        permanent: true,
      },
      {
        source: `/${locale}/contact-us`,
        destination: "/contact-us",
        permanent: true,
      },
      {
        source: `/${locale}/privacy`,
        destination: "/privacy",
        permanent: true,
      },
      {
        source: `/${locale}/terms`,
        destination: "/terms",
        permanent: true,
      },
      {
        source: `/${locale}/disclaimer`,
        destination: "/disclaimer",
        permanent: true,
      },
    ]);

    // Non-locale legacy paths from the old (default) route group
    const legacyRedirects = [
      // Old pinpoint archive shortcut → archive
      {
        source: "/pinpoint/archive",
        destination: "/puzzles",
        permanent: true as const,
      },
      // Feedback → contact-us (top-level)
      {
        source: "/feedback",
        destination: "/contact-us",
        permanent: true as const,
      },
      // Featured → about-us
      {
        source: "/featured",
        destination: "/about-us",
        permanent: true as const,
      },
    ];

    return [...localeRedirects, ...legacyRedirects];
  },
};

export default nextConfig;
