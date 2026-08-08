function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  return [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1] ?? 0;
}

export function parseExplicitIso8601Instant(value: string, label: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`${label} must be an ISO-8601 timestamp with explicit timezone`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fractional = match[7] ?? "";
  const zone = match[8]!;

  if (
    month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
    || second < 0
    || second > 59
  ) {
    throw new Error(`${label} must be a valid Gregorian ISO-8601 timestamp`);
  }

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (
      offsetHour > 14
      || offsetMinute > 59
      || (offsetHour === 14 && offsetMinute !== 0)
    ) {
      throw new Error(`${label} must have a valid timezone offset within ±14:00`);
    }
    const sign = zone.startsWith("+") ? 1 : -1;
    offsetMinutes = sign * (offsetHour * 60 + offsetMinute);
  }

  const milliseconds = Number((fractional + "000").slice(0, 3));
  const localClock = new Date(0);
  localClock.setUTCFullYear(year, month - 1, day);
  localClock.setUTCHours(hour, minute, second, milliseconds);
  const instantMs = localClock.getTime() - offsetMinutes * 60_000;
  if (!Number.isFinite(instantMs)) {
    throw new Error(`${label} must be a valid ISO-8601 timestamp`);
  }
  return instantMs;
}

export function assertFirstExecutableAtAfterRetrievalStart(
  firstExecutableAt: string,
  retrievalStartedAt: Date,
): void {
  const executableMs = parseExplicitIso8601Instant(firstExecutableAt, "--first-executable-at");
  const retrievalMs = retrievalStartedAt.getTime();
  if (!Number.isFinite(retrievalMs)) {
    throw new Error("retrieval start must be a valid timestamp");
  }
  if (executableMs < retrievalMs) {
    throw new Error("--first-executable-at must be at or after retrieval start");
  }
}
