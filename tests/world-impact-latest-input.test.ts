import assert from "node:assert/strict";
import "./world-impact-report-input-date.test.js";
import "./world-impact-audit-input.test.js";
import { parseWorldImpactLatestSnapshot } from "../src/world-impact-latest-input.js";

assert.deepEqual(parseWorldImpactLatestSnapshot("[]"), [], "empty canonical latest snapshot remains valid");
assert.equal(
  parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803"}]')[0]?.reviewKey,
  "event__5803",
  "rows with stable review identity remain mergeable",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot("{"),
  /not valid JSON/,
  "parse failure must block a write instead of replacing latest with only updated rows",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('{"reviews":[]}'),
  /root must be an array/,
  "invalid root must block a write instead of silently becoming an empty snapshot",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[null]'),
  /row 1 must be an object/,
  "malformed rows must not be dereferenced during latest merge",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{}]'),
  /row 1 requires reviewKey/,
  "rows without stable identity must not participate in latest merge",
);

console.log("world-impact latest input: invalid canonical snapshots fail closed before write");
