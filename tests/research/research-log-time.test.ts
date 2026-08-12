import assert from "node:assert/strict";
import { isFutureResearchLogInstant } from "../../src/research/research-log-time.js";

assert.equal(
  isFutureResearchLogInstant(
    "2026-08-13T01:00:00.123+09:00",
    "2026-08-12T16:00:00.123Z",
  ),
  false,
  "the same instant expressed in JST must not be rejected as future against UTC now",
);

assert.equal(
  isFutureResearchLogInstant(
    "2026-08-13T01:00:00.123000001+09:00",
    "2026-08-12T16:00:00.123Z",
  ),
  true,
  "a 1ns future Research Log timestamp must still fail closed",
);

assert.throws(
  () => isFutureResearchLogInstant(
    "2026-08-13T01:00:00",
    "2026-08-12T16:00:00.123Z",
  ),
  /explicit timezone/,
  "Research Log instant ordering must reject implicit timezones",
);

console.log("research/research-log-time.test.ts passed");
