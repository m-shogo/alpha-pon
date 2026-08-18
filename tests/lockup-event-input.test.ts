import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readListingEventRows } from "../src/listing-event-alert-input.js";
import { isLockupMemo, type LockupMemo } from "../src/lockup-event-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-lockup-event-input-"));
const path = join(dir, "lockup_memos.jsonl");

try {
  writeFileSync(path, [
    JSON.stringify({ id: "valid-1", name: "Valid", listingDate: "2026-07-01", lockupDays: 180 }),
    "{broken",
    "{}",
    JSON.stringify({ id: "bad-days", name: "Bad", lockupDays: "180" }),
    JSON.stringify({ id: "bad-listing-date", name: "Bad Listing Date", listingDate: "2026-02-31" }),
    JSON.stringify({ id: "bad-expiry-date", name: "Bad Expiry Date", lockupExpiryDate: "0000-12-28" }),
    JSON.stringify({ id: "bad-chronology", name: "Bad Chronology", listingDate: "2026-07-01", lockupExpiryDate: "2026-06-30" }),
    JSON.stringify({ id: "valid-2", name: "Valid 2", listingDate: "2026-07-01", lockupExpiryDate: "2026-12-28" }),
  ].join("\n"));

  const result = readListingEventRows<LockupMemo>(path, isLockupMemo);
  assert.deepEqual(result.rows.map(row => row.id), ["valid-1", "valid-2"]);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 2/);
  assert.equal(result.warnings[1], `${path}: invalid_rows=5`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("lockup-event-input: OK");