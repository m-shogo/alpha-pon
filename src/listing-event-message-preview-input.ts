export type ListingEventMessageAlert = {
  id: string;
  code?: string;
  name: string;
  eventType: string;
  eventDate?: string | null;
  alertType: "upcoming" | "review_due" | "missing_date";
  daysUntil: number | null;
  effectiveNotificationLevel: "priority" | "morning_summary" | "log";
  reason: string;
};

export type ListingEventMessageInput = {
  alerts: ListingEventMessageAlert[];
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalOptionalCode(value: unknown): boolean {
  return value === undefined
    || (typeof value === "string" && value.trim().length > 0 && value === value.trim());
}

function isListingEventMessageAlert(value: unknown): value is ListingEventMessageAlert {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && typeof value.eventType === "string"
    && value.eventType.trim().length > 0
    && isCanonicalOptionalCode(value.code)
    && (value.eventDate === undefined || value.eventDate === null || typeof value.eventDate === "string")
    && (value.alertType === "upcoming" || value.alertType === "review_due" || value.alertType === "missing_date")
    && (value.daysUntil === null || (typeof value.daysUntil === "number" && Number.isInteger(value.daysUntil)))
    && (value.effectiveNotificationLevel === "priority"
      || value.effectiveNotificationLevel === "morning_summary"
      || value.effectiveNotificationLevel === "log")
    && typeof value.reason === "string"
    && value.reason.trim().length > 0;
}

export function parseListingEventMessageInput(text: string): ListingEventMessageInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { alerts: [], warnings: ["listing_event_alerts_latest.json: parse_error"] };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.alerts)) {
    return { alerts: [], warnings: ["listing_event_alerts_latest.json: invalid_alerts_root"] };
  }

  const alerts: ListingEventMessageAlert[] = [];
  const invalidRows: number[] = [];
  parsed.alerts.forEach((value, index) => {
    if (!isListingEventMessageAlert(value)) {
      invalidRows.push(index + 1);
      return;
    }
    alerts.push(value);
  });

  return {
    alerts,
    warnings: invalidRows.length > 0
      ? [`listing_event_alerts_latest.json: invalid_rows=${invalidRows.join(",")}`]
      : [],
  };
}
