import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readListingReviewSourceInput } from "../src/listing-review-source-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-listing-review-source-input-"));
const path = join(dir, "listing_events.jsonl");

try {
  writeFileSync(path, [
    JSON.stringify({ id: "listing-1", code: "1234", name: "Valid Listing", eventType: "listing_day", eventDate: "2026-08-01" }),
    "{broken",
    JSON.stringify({ id: "listing-2", code: "5678", name: "Valid Listing 2", eventType: "listing_day", eventDate: "2026-08-02" }),
    JSON.stringify({ id: "", name: "Invalid", eventType: "listing_day" }),
  ].join("\n"));

  const result = readListingReviewSourceInput(path);
  assert.deepEqual(result.events.map(event => event.id), ["listing-1", "listing-2"]);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 2/);
  assert.equal(result.warnings[1], `${path}: invalid_rows=1`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("listing-review-source-input: OK");
