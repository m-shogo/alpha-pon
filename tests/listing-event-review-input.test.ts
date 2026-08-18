import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readListingEventReviewInput } from "../src/listing-event-review-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-listing-event-review-input-"));
const path = join(dir, "listing_events.jsonl");

try {
  writeFileSync(path, [
    JSON.stringify({ id: "valid-1", code: "1234", name: "Valid", eventType: "listing_day", eventDate: "2024-02-29", publicPrice: 1000, reviewPrice: 1100, notes: [] }),
    "{broken",
    "null",
    "{}",
    JSON.stringify({ id: "bad-number", name: "Bad", eventType: "listing_day", reviewPrice: "1100" }),
    JSON.stringify({ id: "bad-zero-public", name: "Zero Public", eventType: "listing_day", publicPrice: 0 }),
    JSON.stringify({ id: "bad-negative-initial", name: "Negative Initial", eventType: "listing_day", initialPrice: -1 }),
    JSON.stringify({ id: "bad-zero-review", name: "Zero Review", eventType: "listing_day", reviewPrice: 0 }),
    JSON.stringify({ id: "bad-empty-code", code: "", name: "Empty Code", eventType: "listing_day" }),
    JSON.stringify({ id: "bad-padded-code", code: " 1234", name: "Padded Code", eventType: "listing_day" }),
    JSON.stringify({ id: "bad-notes", name: "Bad Notes", eventType: "listing_day", notes: {} }),
    JSON.stringify({ id: "bad-date", name: "Bad Date", eventType: "listing_day", eventDate: "2026-02-31" }),
    JSON.stringify({ id: "bad-year-zero", name: "Bad Year", eventType: "listing_day", eventDate: "0000-01-01" }),
    JSON.stringify({ id: "valid-2", name: "Valid 2", eventType: "first_earnings", topixRelativeReturn: 0.12 }),
  ].join("\n"));

  const result = readListingEventReviewInput(path);
  assert.deepEqual(result.rows.map(row => row.id), ["valid-1", "valid-2"]);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 2/);
  assert.equal(result.warnings[1], `${path}: invalid_rows=11`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("listing-event-review-input: OK");
