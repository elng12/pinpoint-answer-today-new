import { fetchRegistry } from "@/lib/puzzles/data-sources";
import type {
  PuzzleDetailContentRecord,
  PuzzleDetailState,
  PuzzleRegistryEntryRecord,
} from "@/lib/puzzles/schema";

export function resolveRegistryDetailState(
  entry: Pick<PuzzleRegistryEntryRecord, "status" | "detailState">,
): PuzzleDetailState {
  if (entry.detailState) {
    return entry.detailState;
  }

  return entry.status === "draft" || entry.status === "preview" ? "draft" : "published";
}

export function resolveFormalDetailState(
  entry: Pick<PuzzleRegistryEntryRecord, "status" | "detailState">,
  detailContent: Pick<PuzzleDetailContentRecord, "detailState">,
): PuzzleDetailState {
  return detailContent.detailState ?? resolveRegistryDetailState(entry);
}

export function isPublicDetailState(detailState: PuzzleDetailState): boolean {
  return detailState === "published" || detailState === "fallback_full";
}

export function isDetailEntry(
  entry: PuzzleRegistryEntryRecord,
): entry is PuzzleRegistryEntryRecord & {
  mainAnswer: string;
  category: string;
  status: "live" | "archived";
} {
  return (
    (entry.status === "live" || entry.status === "archived") &&
    !!entry.mainAnswer &&
    !!entry.category
  );
}

export function isPublicDetailEntry(
  entry: PuzzleRegistryEntryRecord,
): entry is PuzzleRegistryEntryRecord & {
  mainAnswer: string;
  category: string;
  status: "live" | "archived";
} {
  return isDetailEntry(entry) && isPublicDetailState(resolveRegistryDetailState(entry));
}

export async function getDetailEntries() {
  const entries = await fetchRegistry();
  return entries.filter(isPublicDetailEntry);
}

