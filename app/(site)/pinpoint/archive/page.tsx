import { permanentRedirect } from "next/navigation";
import { routes } from "@/lib/site/routes";

export default function LegacyPinpointArchivePage() {
  permanentRedirect(routes.archive);
}
