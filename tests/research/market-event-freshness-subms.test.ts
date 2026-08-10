import assert from "node:assert/strict";
import { marketEventFreshness } from "../../src/market-events/projection.js";

const staleAfter = "2026-08-10T14:00:00.000000000Z";

assert.equal(
  marketEventFreshness({ staleAfter }, "2026-08-10T14:00:00.000000000Z"),
  "FRESH",
  "the exact staleAfter instant remains fresh",
);
assert.equal(
  marketEventFreshness({ staleAfter }, "2026-08-10T14:00:00.000000001Z"),
  "STALE",
  "a +1ns generatedAt must not collapse into the same millisecond as staleAfter",
);

console.log("research/market-event-projection: sub-ms freshness boundary OK");
