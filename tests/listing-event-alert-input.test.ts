import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./first-earnings-input.test.js";
import "./listing-event-review-input.test.js";
import { readListingEventRows } from "../src/listing-event-alert-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-listing-event-alert-input-"));
const path = join(dir, "listing_events.jsonl");

type ListingRow = { id: string; name: string; eventType: string };
const isListingRow = (value: unknown): value is ListingRow => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.length > 0
    && typeof row.name === "string" && row.name.length > 0
    && typeof row.eventType === "string" && row.eventType.length > 0;
};

try {
  writeFileSync(path, [
    JSON.stringify({ id: "valid-1", name: "Valid", eventType: "listing_day" }),
    "{broken",
    "null",
    "{}",
    JSON.stringify({ id: "valid-2", name: "Valid 2", eventType: "first_earnings" }),
  ].join("\n"));

  const result = readListingEventRows<ListingRow>(path, isListingRow);
  assert.deepEqual(result.rows.map(row => row.id), ["valid-1", "valid-2"]);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 2/);
  assert.equal(result.warnings[1], `${path}: invalid_rows=2`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("listing-event-alert-input: OK");