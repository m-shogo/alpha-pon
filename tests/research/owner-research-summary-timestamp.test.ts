import assert from "node:assert/strict";
import { isOwnerResearchTimestampSafe } from "../../apps/web/lib/research-summary.js";

const now = Date.parse("2026-08-30T12:00:00.000Z");

assert.equal(
  isOwnerResearchTimestampSafe("2026-08-30T11:59:59.999Z", now),
  true,
  "a valid timestamp before the evaluation time must be accepted",
);
assert.equal(
  isOwnerResearchTimestampSafe("2026-08-30T21:00:00+09:00", now),
  true,
  "an equivalent timestamp with an explicit offset must be accepted",
);
assert.equal(
  isOwnerResearchTimestampSafe("2026-08-30T12:00:00.001Z", now),
  false,
  "a future-dated timestamp must fail closed",
);
assert.equal(
  isOwnerResearchTimestampSafe("not-a-timestamp", now),
  false,
  "a malformed timestamp must fail closed",
);
assert.equal(
  isOwnerResearchTimestampSafe("2026-08-30", now),
  false,
  "a date without an explicit time zone must fail closed",
);

console.log("research/owner summary: timestamp safety contract OK");
