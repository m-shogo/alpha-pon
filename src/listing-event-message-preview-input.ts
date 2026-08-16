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
    if (!isRecord(value)) {
      invalidRows.push(index + 1);
      return;
    }
    alerts.push(value as ListingEventMessageAlert);
  });

  return {
    alerts,
    warnings: invalidRows.length > 0
      ? [`listing_event_alerts_latest.json: invalid_rows=${invalidRows.join(",")}`]
      : [],
  };
}
