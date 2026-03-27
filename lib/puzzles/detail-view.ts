import type { FaqItem } from "@/lib/puzzles/schema";

export function getVisibleDetailFaqs(
  faqs: FaqItem[],
  detailMode: "full" | "short",
): FaqItem[] {
  return detailMode === "short" ? faqs.slice(0, 2) : faqs;
}
