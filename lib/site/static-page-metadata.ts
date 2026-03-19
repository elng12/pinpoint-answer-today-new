import staticPageMetadata from "@/data/static-page-metadata.json";

type StaticRouteMetadata = {
  generatedAt?: string;
  routes?: Record<string, { lastModified?: string }>;
};

const metadata = staticPageMetadata as StaticRouteMetadata;

function getFallbackDate(): Date {
  return new Date(metadata.generatedAt ?? "2026-01-01T00:00:00.000Z");
}

export function getStaticRouteLastModified(path: string): Date {
  const value = metadata.routes?.[path]?.lastModified;
  const parsed = value ? new Date(value) : getFallbackDate();
  return Number.isNaN(parsed.getTime()) ? getFallbackDate() : parsed;
}

export function formatStaticRouteLastUpdated(path: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(getStaticRouteLastModified(path));
}
