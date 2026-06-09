import { permanentRedirect } from "next/navigation";
import { routes } from "@/lib/paths/routes";

export default function AnswerArchiveAliasPage() {
  permanentRedirect(routes.archive);
}
