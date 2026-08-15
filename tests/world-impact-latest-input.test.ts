import assert from "node:assert/strict";
import "./world-impact-report-input-date.test.js";
import "./world-impact-audit-input.test.js";
import { parseWorldImpactLatestSnapshot } from "../src/world-impact-latest-input.js";

assert.deepEqual(parseWorldImpactLatestSnapshot("[]"), [], "empty canonical latest snapshot remains valid");
assert.equal(
  parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803"}]')[0]?.reviewKey,
  "event__5803",
  "legacy rows with only stable review identity remain mergeable",
);
assert.equal(
  parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","createdAt":"2026-06-10","updatedAt":"2026-06-12","outcomes":[{"priceStartDate":"2026-06-10","priceEndDate":"2026-06-11","evaluationAsOf":"2026-06-12","evaluatedAt":"2026-06-12"}]}]')[0]?.reviewKey,
  "event__5803",
  "valid optional evaluation provenance remains mergeable",
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
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","createdAt":"2026-02-31"}]'),
  /createdAt must be a real YYYY-MM-DD date/,
  "invalid optional provenance dates must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","createdAt":"2026-06-12","updatedAt":"2026-06-11"}]'),
  /updatedAt must not precede createdAt/,
  "reversed review lifecycle must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":{}}]'),
  /outcomes must be an array when present/,
  "malformed outcomes containers must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":[{"priceStartDate":"2026-06-12","priceEndDate":"2026-06-11"}]}]'),
  /priceStartDate must not follow priceEndDate/,
  "reversed evaluation chronology must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":[{"priceEndDate":"2026-06-13","evaluationAsOf":"2026-06-12"}]}]'),
  /priceEndDate must not follow evaluationAsOf/,
  "future price endpoint relative to cutoff must block canonical latest writes",
);
assert.throws(
  () => parseWorldImpactLatestSnapshot('[{"reviewKey":"event__5803","outcomes":[{"evaluationAsOf":"2026-06-13","evaluatedAt":"2026-06-12"}]}]'),
  /evaluationAsOf must not follow evaluatedAt/,
  "future evaluation cutoff relative to evaluation date must block canonical latest writes",
);

console.log("world-impact latest input: invalid canonical snapshots and optional provenance fail closed before write");
