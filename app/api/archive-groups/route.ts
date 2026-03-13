import { NextResponse } from "next/server";
import { getArchiveEntriesGrouped } from "@/lib/puzzles/data";

export const revalidate = 86400;

export async function GET() {
  const groups = await getArchiveEntriesGrouped();
  return NextResponse.json({ groups });
}
