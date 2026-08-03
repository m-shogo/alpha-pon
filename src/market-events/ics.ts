import type { EventSource, MarketEvent } from "./contracts.js";

export type IcsMarketEvent = {
  event: MarketEvent;
  revisionNumber: number;
  sources: EventSource[];
};

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date for ICS: ${value}`);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new Error(`Invalid DATE_ONLY value: ${value}`);
  return `${match[1]}${match[2]}${match[3]}`;
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  const result: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).byteLength;
    if (current && currentBytes + bytes > 75) {
      result.push(current);
      current = ` ${character}`;
      currentBytes = 1 + bytes;
    } else {
      current += character;
      currentBytes += bytes;
    }
  }
  result.push(current);
  return result;
}

function description(item: IcsMarketEvent): string {
  const { event, sources } = item;
  const lines = [
    `重要度: ${event.priority}`,
    `判断状態: ${event.currentDecisionState}`,
    event.whyItMatters ? `重要理由: ${event.whyItMatters}` : "",
    event.checksBefore.length ? `事前確認: ${event.checksBefore.join(" / ")}` : "",
    event.checksAfter.length ? `通過後確認: ${event.checksAfter.join(" / ")}` : "",
    event.edgeTypes.length ? `関連Edge: ${event.edgeTypes.join(" / ")}` : "",
    sources.length ? `一次情報: ${sources.map(source => source.url).join(" / ")}` : "",
    "売買推奨ではありません。一次情報と価格反応を確認してください。",
  ].filter(Boolean);
  return escapeText(lines.join("\n"));
}

function eventDateLines(event: MarketEvent): string[] | null {
  switch (event.time.precision) {
    case "UNKNOWN":
      return null;
    case "WINDOW": {
      const start = event.time.windowStart;
      const end = event.time.windowEnd;
      if (!start || !end) return null;
      return [
        `DTSTART;VALUE=DATE:${formatDateOnly(start)}`,
        `DTEND;VALUE=DATE:${formatDateOnly(addDays(end, 1))}`,
        "X-ALPHA-PON-TIME-PRECISION:WINDOW",
      ];
    }
    case "DATE_ONLY": {
      if (!event.time.startAt) return null;
      const end = event.time.endAt ?? addDays(event.time.startAt, 1);
      return [
        `DTSTART;VALUE=DATE:${formatDateOnly(event.time.startAt)}`,
        `DTEND;VALUE=DATE:${formatDateOnly(event.time.endAt ? addDays(end, 1) : end)}`,
        "X-ALPHA-PON-TIME-PRECISION:DATE_ONLY",
      ];
    }
    case "EXACT": {
      if (!event.time.startAt) return null;
      const start = new Date(event.time.startAt);
      const end = event.time.endAt ? new Date(event.time.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
      return [
        `DTSTART:${formatUtc(start.toISOString())}`,
        `DTEND:${formatUtc(end.toISOString())}`,
        "X-ALPHA-PON-TIME-PRECISION:EXACT",
      ];
    }
  }
}

function alarmLines(event: MarketEvent): string[] {
  if (event.status === "CANCELLED" || event.status === "COMPLETED") return [];
  if (event.priority === "S0") {
    return [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`[S0] ${event.issuerName} ${event.title}`)}`,
      "TRIGGER:-PT30M",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`[S0] ${event.issuerName} ${event.title}`)}`,
      "TRIGGER:-P1D",
      "END:VALARM",
    ];
  }
  if (event.priority === "S1") {
    return [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`[S1] ${event.issuerName} ${event.title}`)}`,
      "TRIGGER:-P1D",
      "END:VALARM",
    ];
  }
  return [];
}

function statusValue(event: MarketEvent): "CANCELLED" | "TENTATIVE" | "CONFIRMED" {
  if (event.status === "CANCELLED") return "CANCELLED";
  if (event.status === "TENTATIVE" || event.status === "UNKNOWN_DATE" || event.status === "POSTPONED") return "TENTATIVE";
  return "CONFIRMED";
}

export function buildMarketEventsIcs(items: IcsMarketEvent[], generatedAt: string): {
  content: string;
  included: number;
  excludedUnknownDate: number;
} {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alpha Pon//Market Events v1//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Alpha Pon Market Events",
    "X-WR-CALDESC:Alpha Ponが一次情報から追跡する重要イベント。売買推奨ではありません。",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  let included = 0;
  let excludedUnknownDate = 0;

  for (const item of items) {
    const dateLines = eventDateLines(item.event);
    if (!dateLines) {
      excludedUnknownDate += 1;
      continue;
    }
    const event = item.event;
    const firstSource = item.sources[0]?.url;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.eventId}@alpha-pon`,
      `SEQUENCE:${Math.max(0, item.revisionNumber - 1)}`,
      `DTSTAMP:${formatUtc(generatedAt)}`,
      `LAST-MODIFIED:${formatUtc(event.updatedAt)}`,
      `STATUS:${statusValue(event)}`,
      `SUMMARY:${escapeText(`[${event.priority}][${event.issuerCode ?? "--"}] ${event.issuerName} ${event.title}`)}`,
      `DESCRIPTION:${description(item)}`,
      `CATEGORIES:${escapeText([event.eventType, event.priority, event.currentDecisionState, ...event.edgeTypes].join(","))}`,
      `X-ALPHA-PON-EVENT-ID:${event.eventId}`,
      `X-ALPHA-PON-EVENT-TYPE:${event.eventType}`,
      `X-ALPHA-PON-DECISION:${event.currentDecisionState}`,
      `X-ALPHA-PON-OCCURRENCE:${escapeText(event.occurrenceKey)}`,
      ...dateLines,
    );
    if (firstSource) lines.push(`URL:${firstSource}`);
    lines.push(...alarmLines(event), "END:VEVENT");
    included += 1;
  }

  lines.push("END:VCALENDAR");
  return {
    content: `${lines.flatMap(foldLine).join("\r\n")}\r\n`,
    included,
    excludedUnknownDate,
  };
}
