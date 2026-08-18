import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFirstEarningsListingEvents } from "../src/first-earnings-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-first-earnings-input-"));
const path = join(dir, "listing_events.jsonl");

try {
  writeFileSync(path, [
    JSON.stringify({ id: "valid-1", name: "Valid", eventType: "listing_day", eventDate: "2026-08-01" }),
    JSON.stringify({ id: "valid-leap", name: "Leap", eventType: "listing_day", eventDate: "2024-02-29" }),
    "{broken",
    "null",
    "{}",
    JSON.stringify({ id: "bad-notes", name: "Bad", eventType: "listing_day", notes: {} }),
    JSON.stringify({ id: "bad-date", name: "Bad Date", eventType: "listing_day", eventDate: "2026-02-31" }),
    JSON.stringify({ id: "bad-year-zero", name: "Bad Year", eventType: "listing_day", eventDate: "0000-01-01" }),
    JSON.stringify({ id: "valid-2", name: "Valid 2", eventType: "first_earnings", confidence: "low" }),
  ].join("\n"));

  const result = readFirstEarningsListingEvents(path);
  assert.deepEqual(result.rows.map(row => row.id), ["valid-1", "valid-leap", "valid-2"]);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 3/);
  assert.equal(result.warnings[1], `${path}: invalid_rows=5`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("first-earnings-input: OK");