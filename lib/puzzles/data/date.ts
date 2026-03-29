const BASELINE_NUMBER = 536;
const BASELINE_DATE_UTC = Date.UTC(2025, 9, 18); // 2025-10-18
const MS_IN_DAY = 86_400_000;

export function formatDisplayDate(input: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${input}T00:00:00Z`));
}

export function formatMonthLabel(input: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${input}T00:00:00Z`));
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function inferPuzzleNumberFromDate(isoDate: string): number | null {
  if (!isIsoDate(isoDate)) return null;

  const parsedDate = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const utc = Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate());
  const diffDays = Math.floor((utc - BASELINE_DATE_UTC) / MS_IN_DAY);
  if (diffDays < 0) return null;

  return BASELINE_NUMBER + diffDays;
}

