export const PINPOINT_RESET_TIME_ZONE = "America/Los_Angeles";
export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseIsoDate(dateIso: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim());
  if (!match) {
    throw new Error(`Invalid ISO date: ${dateIso}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

function getDatePartsInTimeZone(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const lookup = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function getTimeZoneMidnightUtcDate(dateIso: string, timeZone: string): Date {
  const target = parseIsoDate(dateIso);
  let utcTs = Date.UTC(target.year, target.month - 1, target.day, 0, 0, 0);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcTs), timeZone);
    const nextUtcTs = Date.UTC(target.year, target.month - 1, target.day, 0, 0, 0) - offsetMs;
    if (Math.abs(nextUtcTs - utcTs) < 1000) {
      utcTs = nextUtcTs;
      break;
    }
    utcTs = nextUtcTs;
  }

  return new Date(utcTs);
}

export function getPinpointUnlockDate(dateIso: string): Date {
  return getTimeZoneMidnightUtcDate(dateIso, PINPOINT_RESET_TIME_ZONE);
}

export function getPinpointUnlockIso(dateIso: string): string {
  return getPinpointUnlockDate(dateIso).toISOString();
}

export function getPinpointUnlockUtcHour(dateIso: string): number {
  return getPinpointUnlockDate(dateIso).getUTCHours();
}

export function formatPinpointUnlockLabel(
  dateIso: string,
  timeZone: string,
  locale = "en-US",
): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(getPinpointUnlockDate(dateIso));
}

export function formatPinpointUnlockTime(
  dateIso: string,
  timeZone: string,
  locale = "en-GB",
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(getPinpointUnlockDate(dateIso));
}
