import { permanentRedirect } from "next/navigation";
import { routes } from "@/lib/paths/routes";

export default function LegacyPinpointArchivePage() {
  permanentRedirect(routes.archive);
}
