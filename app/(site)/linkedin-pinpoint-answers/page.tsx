import { permanentRedirect } from "next/navigation";
import { routes } from "@/lib/paths/routes";

export default async function ArchiveAliasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();
  permanentRedirect(query ? `${routes.archive}?q=${encodeURIComponent(query)}` : routes.archive);
}
