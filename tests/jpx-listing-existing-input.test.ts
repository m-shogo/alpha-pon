import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJpxListingExistingInput } from "../src/jpx-listing-existing-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-jpx-listing-existing-input-"));
const path = join(dir, "listing_events.jsonl");

try {
  writeFileSync(path, [
    JSON.stringify({ id: "valid-1", name: "Valid", eventType: "listing_day", eventDate: "2026-08-18" }),
    "{broken",
    "{}",
    JSON.stringify({ id: "bad-date", name: "Bad Date", eventType: "listing_day", eventDate: "2026-02-31" }),
    JSON.stringify({ id: "valid-2", name: "Valid 2", eventType: "first_earnings", eventDate: null }),
  ].join("\n"));

  const result = readJpxListingExistingInput(path);
  assert.deepEqual(result.rows.map(row => row.id), ["valid-1", "valid-2"]);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 2/);
  assert.equal(result.warnings[1], `${path}: invalid_rows=2`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("jpx-listing-existing-input: OK");
