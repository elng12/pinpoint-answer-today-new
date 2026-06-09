import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
].join(" ");

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
  `script-src ${scriptSrc}`,
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

const noindexStaticAssetHeader = {
  key: "X-Robots-Tag",
  value: "noindex, noarchive",
};

const noindexLegacyAliasHeader = {
  key: "X-Robots-Tag",
  value: "noindex, follow, noarchive",
};

const legacyAliasHeaderSources = [
  "/:locale(en|pt-BR|fr|de)",
  "/:locale(en|pt-BR|fr|de)/:path*",
  "/linkedin-pinpoint/:path*",
  "/linkedin-pinpoint-answer/:path*",
  "/linkedin-pinpoint-answers/:slug/opengraph-image",
  "/opengraph-image",
  "/og-image.png",
  "/pinpoint-answer-:number(\\d+)",
  "/pinpoint/:value",
  "/puzzles/:number(\\d+)",
  "/puzzles/pinpoint-answer-:number(\\d+)",
  "/puzzles/linkedin-pinpoint-answer-:number(\\d+)",
  "/puzzles/themes/:path*",
  "/puzzles/connectors/:path*",
  "/puzzles/connector/:path*",
  "/sitemaps/:path*",
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
        source: "/_next/static/:path*",
        headers: [noindexStaticAssetHeader],
      },
      {
        source: "/favicon/:path*",
        headers: [noindexStaticAssetHeader],
      },
      ...legacyAliasHeaderSources.map((source) => ({
        source,
        headers: [noindexLegacyAliasHeader],
      })),
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
      // Locale archive alias: /en/linkedin-pinpoint-answers → canonical archive
      {
        source: `/${locale}/linkedin-pinpoint-answers`,
        destination: "/linkedin-pinpoint-answers",
        permanent: true,
      },
      // Legacy singular answer archive: /en/linkedin-pinpoint-answer → canonical archive
      {
        source: `/${locale}/linkedin-pinpoint-answer`,
        destination: "/linkedin-pinpoint-answers",
        permanent: true,
      },
      // Legacy archive shortcut: /en/linkedin-pinpoint → canonical archive
      {
        source: `/${locale}/linkedin-pinpoint`,
        destination: "/linkedin-pinpoint-answers",
        permanent: true,
      },
      // Legacy connectors archive root has no dedicated page in the new site
      {
        source: `/${locale}/puzzles/connectors`,
        destination: "/linkedin-pinpoint-answers",
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
        destination: "/linkedin-pinpoint-answers",
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
      // Legacy connectors archive root → canonical archive
      {
        source: "/puzzles/connectors",
        destination: "/linkedin-pinpoint-answers",
        permanent: true as const,
      },
      // Old LinkedIn archive shortcut → canonical archive
      {
        source: "/linkedin-pinpoint",
        destination: "/linkedin-pinpoint-answers",
        permanent: true as const,
      },
      // Legacy singular answer archive → canonical archive
      {
        source: "/linkedin-pinpoint-answer",
        destination: "/linkedin-pinpoint-answers",
        permanent: true as const,
      },
      // Old pinpoint archive shortcut → archive
      {
        source: "/pinpoint/archive",
        destination: "/linkedin-pinpoint-answers",
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
      // Old locale sitemap endpoints now collapse into the single canonical sitemap.
      {
        source: "/sitemaps/en.xml",
        destination: "/sitemap.xml",
        permanent: true as const,
      },
      {
        source: "/sitemaps/pt-BR.xml",
        destination: "/sitemap.xml",
        permanent: true as const,
      },
      {
        source: "/sitemaps/fr.xml",
        destination: "/sitemap.xml",
        permanent: true as const,
      },
      {
        source: "/sitemaps/de.xml",
        destination: "/sitemap.xml",
        permanent: true as const,
      },
    ];

    return [...localeRedirects, ...legacyRedirects];
  },
};

export default nextConfig;
