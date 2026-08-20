import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./listing-automation-summary-input.test.js";
import "./listing-event-alert-input.test.js";
import { inspectRequiredFile, readSmokeText } from "../src/listing-automation-smoke-input.js";
import { parseListingEventMessageInput } from "../src/listing-event-message-preview-input.js";

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-listing-smoke-"));
  try {
    const valid = join(root, "valid.txt");
    const empty = join(root, "empty.txt");
    const directory = join(root, "directory");
    writeFileSync(valid, "ok", "utf-8");
    writeFileSync(empty, "", "utf-8");
    mkdirSync(directory);
    assert.equal(inspectRequiredFile(valid), "ok", "non-empty regular files remain valid smoke evidence");
    assert.equal(inspectRequiredFile(empty), "empty", "empty required files must fail closed");
    assert.equal(inspectRequiredFile(directory), "not_file", "directories must not satisfy required-file smoke checks");
    assert.equal(inspectRequiredFile(join(root, "missing.txt")), "missing", "missing required files remain failures");
    assert.equal(readSmokeText(valid), "ok", "valid regular files remain readable by smoke checks");
    assert.equal(readSmokeText(empty), "", "empty smoke inputs stay fail-closed");
    assert.equal(readSmokeText(directory), "", "directory paths must be isolated instead of throwing EISDIR");
    assert.equal(readSmokeText(join(root, "missing.txt")), "", "missing smoke inputs stay fail-closed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const AS_OF = "2026-08-18";
const VALID_ALERT = {
  id: "listing-1",
  code: "1234",
  name: "Example",
  eventType: "listing",
  eventDate: "2026-08-20",
  alertType: "upcoming",
  daysUntil: 2,
  effectiveNotificationLevel: "priority",
  reason: "fixture",
};
const payload = (alerts: unknown[], generatedAt = AS_OF) => ({ generatedAt, alerts });

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify(payload([VALID_ALERT])), AS_OF),
  { alerts: [VALID_ALERT], warnings: [] },
  "valid current-day listing-event alert payload remains available to the read-only preview",
);

assert.deepEqual(
  parseListingEventMessageInput("{", AS_OF),
  { alerts: [], warnings: ["listing_event_alerts_latest.json: parse_error"] },
  "malformed JSON must be isolated instead of crashing the preview",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify({ alerts: [VALID_ALERT] }), AS_OF),
  { alerts: [], warnings: ["listing_event_alerts_latest.json: invalid_generated_at"] },
  "missing generatedAt must fail closed",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify(payload([VALID_ALERT], "2026-02-31")), AS_OF),
  { alerts: [], warnings: ["listing_event_alerts_latest.json: invalid_generated_at"] },
  "impossible generatedAt dates must fail closed",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify(payload([VALID_ALERT], "2026-08-17")), AS_OF),
  { alerts: [], warnings: ["listing_event_alerts_latest.json: stale_generated_at"] },
  "previous-day alert reports must not be treated as current read-only evidence",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify({ generatedAt: AS_OF, alerts: {} }), AS_OF),
  { alerts: [], warnings: ["listing_event_alerts_latest.json: invalid_alerts_root"] },
  "non-array alerts roots must fail closed",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify(payload([VALID_ALERT, null, "broken"])), AS_OF),
  {
    alerts: [VALID_ALERT],
    warnings: ["listing_event_alerts_latest.json: invalid_rows=2,3"],
  },
  "malformed rows must be isolated while valid alerts remain visible",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify(payload([
    VALID_ALERT,
    {},
    { ...VALID_ALERT, id: "" },
    { ...VALID_ALERT, effectiveNotificationLevel: "urgent" },
    { ...VALID_ALERT, daysUntil: "2" },
    { ...VALID_ALERT, code: " 1234" },
  ])), AS_OF),
  {
    alerts: [VALID_ALERT],
    warnings: ["listing_event_alerts_latest.json: invalid_rows=2,3,4,5,6"],
  },
  "JSON-valid malformed rows must not create undefined preview text or false alert counts",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify(payload([
    VALID_ALERT,
    { ...VALID_ALERT, alertType: "missing_date", eventDate: null, daysUntil: null },
    { ...VALID_ALERT, alertType: "missing_date", eventDate: "2026-02-31", daysUntil: null },
    { ...VALID_ALERT, alertType: "upcoming", daysUntil: null },
    { ...VALID_ALERT, alertType: "upcoming", daysUntil: -1 },
    { ...VALID_ALERT, alertType: "review_due", eventDate: AS_OF, daysUntil: 1 },
    { ...VALID_ALERT, alertType: "review_due", eventDate: AS_OF, daysUntil: 0 },
  ])), AS_OF),
  {
    alerts: [
      VALID_ALERT,
      { ...VALID_ALERT, alertType: "missing_date", eventDate: null, daysUntil: null },
      { ...VALID_ALERT, alertType: "missing_date", eventDate: "2026-02-31", daysUntil: null },
      { ...VALID_ALERT, alertType: "review_due", eventDate: AS_OF, daysUntil: 0 },
    ],
    warnings: ["listing_event_alerts_latest.json: invalid_rows=4,5,6"],
  },
  "alertType and daysUntil must preserve producer chronology before preview counts are trusted",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify(payload([
    VALID_ALERT,
    { ...VALID_ALERT, daysUntil: 3 },
  ])), AS_OF),
  {
    alerts: [VALID_ALERT],
    warnings: ["listing_event_alerts_latest.json: invalid_rows=2"],
  },
  "daysUntil must equal the eventDate distance from the current generatedAt date",
);

assert.deepEqual(
  parseListingEventMessageInput(JSON.stringify(payload([
    VALID_ALERT,
    { ...VALID_ALERT, eventDate: undefined },
    { ...VALID_ALERT, eventDate: null },
    { ...VALID_ALERT, eventDate: "2026-02-31" },
    { ...VALID_ALERT, eventDate: "0000-01-01" },
    { ...VALID_ALERT, alertType: "review_due", daysUntil: 0, eventDate: "2026-02-31" },
  ])), AS_OF),
  {
    alerts: [VALID_ALERT],
    warnings: ["listing_event_alerts_latest.json: invalid_rows=2,3,4,5,6"],
  },
  "dated alert states must carry a real Gregorian eventDate before preview counts are trusted",
);

console.log("listing-event-message-preview-input: OK");