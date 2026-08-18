import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readListingEventRows } from "../src/listing-event-alert-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-listing-event-alert-input-"));
const path = join(dir, "listing_events.jsonl");

try {
  writeFileSync(path, [
    JSON.stringify({ id: "valid-1", name: "Valid", eventType: "listing_day" }),
    "{broken",
    JSON.stringify({ id: "valid-2", name: "Valid 2", eventType: "first_earnings" }),
  ].join("\n"));

  const result = readListingEventRows<{ id: string }>(path);
  assert.deepEqual(result.rows.map(row => row.id), ["valid-1", "valid-2"]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 2/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("listing-event-alert-input: OK");
