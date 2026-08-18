import assert from "node:assert/strict";
import { partitionListingSyncRows } from "../src/listing-event-sync-preview.js";

const existing = [{ id: "existing", eventType: "listing_day", eventDate: "2026-08-20" }];
const duplicateSource = { id: "new", eventType: "listing_day", eventDate: "2026-08-21" };
const result = partitionListingSyncRows(
  [duplicateSource, { ...duplicateSource }, { id: "existing", eventType: "listing_day", eventDate: "2026-08-20" }],
  existing,
);

assert.deepEqual(result.appendable, [duplicateSource]);
assert.equal(result.duplicates.length, 2);
assert.deepEqual(result.duplicates.map(row => row.id), ["new", "existing"]);

console.log("listing-event-sync-preview: source duplicate isolation OK");
