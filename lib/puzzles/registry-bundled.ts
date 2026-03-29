import registryJson from "@/data/puzzles/registry.json";
import { registrySchema, type PuzzleRegistryEntryRecord } from "@/lib/puzzles/schema";

let memo: PuzzleRegistryEntryRecord[] | null = null;

export function getBundledRegistryEntries(): PuzzleRegistryEntryRecord[] {
  if (memo) return memo;

  memo = registrySchema
    .parse(registryJson)
    .slice()
    .sort((a, b) => b.puzzleNumber - a.puzzleNumber);

  return memo;
}

