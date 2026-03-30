import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders: { key: string; value: string }[] = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=()",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
];

const legacyThemeDetailRedirects = [
  {
    source: "/puzzles/themes/types-of-dances",
    destination: "/linkedin-pinpoint-answers/pinpoint-answer-474/",
  },
  {
    source: "/puzzles/themes/things-you-can-raise",
    destination: "/linkedin-pinpoint-answers/pinpoint-answer-536/",
  },
  {
    source: "/puzzles/themes/words-that-precede-ship",
    destination: "/linkedin-pinpoint-answers/pinpoint-answer-562/",
  },
  {
    source: "/puzzles/themes/things-you-can-skip",
    destination: "/linkedin-pinpoint-answers/pinpoint-answer-565/",
  },
] as const;

const legacyConnectorDetailRedirects = [
  {
    source: "/puzzles/connector/mark",
    destination: "/linkedin-pinpoint-answers/pinpoint-answer-587/",
  },
  {
    source: "/puzzles/connectors/course",
    destination: "/linkedin-pinpoint-answers/pinpoint-answer-530/",
  },
] as const;

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
    ];
  },
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
        destination: "/linkedin-pinpoint-answers/:slug/",
        permanent: true,
      },
      // Locale detail OG image paths: /de/linkedin-pinpoint-answers/pinpoint-answer-678/opengraph-image → canonical
      {
        source: `/${locale}/linkedin-pinpoint-answers/:slug/opengraph-image`,
        destination: "/linkedin-pinpoint-answers/:slug/opengraph-image",
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
      // Legacy archive shortcut: /en/linkedin-pinpoint → /puzzles
      {
        source: `/${locale}/linkedin-pinpoint`,
        destination: "/puzzles",
        permanent: true,
      },
      // Legacy connectors archive root has no dedicated page in the new site
      {
        source: `/${locale}/puzzles/connectors`,
        destination: "/puzzles",
        permanent: true,
      },
      // Locale legacy theme family paths that now map cleanly to detail pages
      ...legacyThemeDetailRedirects.map((redirect) => ({
        source: `/${locale}${redirect.source}`,
        destination: redirect.destination,
        permanent: true,
      })),
      // Locale legacy connector family paths that now map cleanly to detail pages
      ...legacyConnectorDetailRedirects.map((redirect) => ({
        source: `/${locale}${redirect.source}`,
        destination: redirect.destination,
        permanent: true,
      })),
      // Route remaining locale legacy family pages through the non-locale fallback handlers
      {
        source: `/${locale}/puzzles/themes/:slug`,
        destination: "/puzzles/themes/:slug",
        permanent: true,
      },
      {
        source: `/${locale}/puzzles/connectors/:slug`,
        destination: "/puzzles/connectors/:slug",
        permanent: true,
      },
      {
        source: `/${locale}/puzzles/connector/:slug`,
        destination: "/puzzles/connector/:slug",
        permanent: true,
      },
      // Locale numeric puzzle pages first normalize to the English legacy alias,
      // then the app validates whether that puzzle number really exists.
      {
        source: `/${locale}/puzzles/:number(\\d+)`,
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number/",
        permanent: true,
      },
      // Locale slug-format puzzle pages: /en/puzzles/pinpoint-answer-530 → canonical
      {
        source: `/${locale}/puzzles/pinpoint-answer-:number(\\d+)`,
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number/",
        permanent: true,
      },
      // Locale-root puzzle alias: /en/pinpoint-answer-678 → /linkedin-pinpoint-answers/pinpoint-answer-678
      {
        source: `/${locale}/pinpoint-answer-:number(\\d+)`,
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number/",
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
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number/",
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
      ...legacyThemeDetailRedirects.map((redirect) => ({
        source: redirect.source,
        destination: redirect.destination,
        permanent: true as const,
      })),
      ...legacyConnectorDetailRedirects.map((redirect) => ({
        source: redirect.source,
        destination: redirect.destination,
        permanent: true as const,
      })),
      // Slug-format puzzle pages without locale: /puzzles/pinpoint-answer-530 → canonical
      {
        source: "/puzzles/pinpoint-answer-:number(\\d+)",
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number/",
        permanent: true as const,
      },
      // Legacy connectors archive root → canonical archive
      {
        source: "/puzzles/connectors",
        destination: "/puzzles",
        permanent: true as const,
      },
      // Old LinkedIn archive shortcut → canonical archive
      {
        source: "/linkedin-pinpoint",
        destination: "/puzzles",
        permanent: true as const,
      },
      // Old root detail alias: /pinpoint-answer-530 → canonical
      {
        source: "/pinpoint-answer-:number(\\d+)",
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number/",
        permanent: true as const,
      },
      // Older numeric detail alias: /linkedin-pinpoint/530 → canonical
      {
        source: "/linkedin-pinpoint/:number(\\d+)",
        destination: "/linkedin-pinpoint-answers/pinpoint-answer-:number/",
        permanent: true as const,
      },
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
      // Common root icon requests from iOS/Safari and crawlers
      {
        source: "/apple-touch-icon.png",
        destination: "/favicon/apple-touch-icon.png",
        permanent: true as const,
      },
      {
        source: "/apple-touch-icon-precomposed.png",
        destination: "/favicon/apple-touch-icon.png",
        permanent: true as const,
      },
    ];

    return [...localeRedirects, ...legacyRedirects];
  },
};

export default nextConfig;
