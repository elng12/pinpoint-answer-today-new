import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/next-pinpoint-preview"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
