import { redirect } from "next/navigation";
import { routes } from "@/lib/paths/routes";

export default function FeedbackRedirectPage() {
  redirect(routes.contact);
}
