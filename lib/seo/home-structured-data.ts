import { routes } from "@/lib/paths/routes";
import { supportEmail } from "@/lib/site/config";
import { absoluteUrl, HOME_SEO_DESCRIPTION } from "@/lib/seo/metadata";

export function buildHomeStructuredData(): Record<string, unknown>[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Pinpoint Answer Today",
      url: absoluteUrl(routes.home),
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/favicon/apple-touch-icon.png"),
        width: 180,
        height: 180,
      },
      description: HOME_SEO_DESCRIPTION,
      email: supportEmail,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: supportEmail,
          url: absoluteUrl(routes.contact),
          availableLanguage: ["en"],
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Pinpoint Answer Today",
      url: absoluteUrl(routes.home),
      description: HOME_SEO_DESCRIPTION,
      inLanguage: "en-US",
      potentialAction: {
        "@type": "SearchAction",
        target: `${absoluteUrl(routes.archive)}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];
}
