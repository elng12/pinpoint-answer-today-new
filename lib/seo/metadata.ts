import type { Metadata } from "next";

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";
}

export function absoluteUrl(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}

export function buildSiteMetadata({
  title,
  description,
}: {
  title: string;
  description: string;
}): Metadata {
  const baseUrl = getSiteUrl();

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Pinpoint Answer Today",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export function buildPageMetadata({
  title,
  description,
  path,
  noIndex = false,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
  type?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(path);

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    robots: noIndex
      ? {
          index: false,
          follow: true,
        }
      : undefined,
    openGraph: {
      title,
      description,
      type,
      url,
      siteName: "Pinpoint Answer Today",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
