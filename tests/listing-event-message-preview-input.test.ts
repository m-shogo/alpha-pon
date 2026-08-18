import assert from "node:assert/strict";
import "./listing-automation-summary-input.test.js";
import { parseListingEventMessageInput } from "../src/listing-event-message-preview-input.js";

const VALID_ALERT = {
  id: "listing-1",
  code: "1234",
  name: "Example",
  eventType: "listing",
  eventDate: "2026-08-20",
  alertType: "upcoming",
  daysUntil: 3,
  effectiveNotificationLevel: "priority",
  reason: "fixture",
};

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify({ alerts: [VALID_ALERT] })),
  { alerts: [VALID_ALERT], warnings: [] },
  "valid listing-event alert payload remains available to the read-only preview",
);

assert.deepEqual(
  parseListingEventMessageInput("{"),
  { alerts: [], warnings: ["listing_event_alerts_latest.json: parse_error"] },
  "malformed JSON must be isolated instead of crashing the preview",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify({ alerts: {} })),
  { alerts: [], warnings: ["listing_event_alerts_latest.json: invalid_alerts_root"] },
  "non-array alerts roots must fail closed",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify({ alerts: [VALID_ALERT, null, "broken"] })),
  {
    alerts: [VALID_ALERT],
    warnings: ["listing_event_alerts_latest.json: invalid_rows=2,3"],
  },
  "malformed rows must be isolated while valid alerts remain visible",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify({
    alerts: [
      VALID_ALERT,
      {},
      { ...VALID_ALERT, id: "" },
      { ...VALID_ALERT, effectiveNotificationLevel: "urgent" },
      { ...VALID_ALERT, daysUntil: "3" },
      { ...VALID_ALERT, code: " 1234" },
    ],
  })),
  {
    alerts: [VALID_ALERT],
    warnings: ["listing_event_alerts_latest.json: invalid_rows=2,3,4,5,6"],
  },
  "JSON-valid malformed rows must not create undefined preview text or false alert counts",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify({
    alerts: [
      VALID_ALERT,
      { ...VALID_ALERT, alertType: "missing_date", daysUntil: 0 },
      { ...VALID_ALERT, alertType: "upcoming", daysUntil: null },
      { ...VALID_ALERT, alertType: "upcoming", daysUntil: -1 },
      { ...VALID_ALERT, alertType: "review_due", daysUntil: 1 },
      { ...VALID_ALERT, alertType: "review_due", daysUntil: 0 },
    ],
  })),
  {
    alerts: [VALID_ALERT, { ...VALID_ALERT, alertType: "review_due", daysUntil: 0 }],
    warnings: ["listing_event_alerts_latest.json: invalid_rows=2,3,4,5"],
  },
  "alertType and daysUntil must preserve producer chronology before preview counts are trusted",
);

console.log("listing-event-message-preview-input: OK");
