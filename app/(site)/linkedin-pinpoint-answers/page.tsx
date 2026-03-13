import { permanentRedirect } from "next/navigation";
import { routes } from "@/lib/paths/routes";

export default function LegacyArchiveRedirectPage() {
  permanentRedirect(routes.archive);
}
