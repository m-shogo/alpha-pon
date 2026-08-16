import assert from "node:assert/strict";
import { normalizeSourceHealthScoreRows } from "../src/source-health-input.js";

for (const dataQuality of ["perfect", "unknown", "OK", 1, null] as const) {
  const normalized = normalizeSourceHealthScoreRows([{ code: "8136", dataQuality }]);
  assert.equal(normalized.valid, false, "unknown dataQuality values must not evade missing-data warnings");
  assert.deepEqual(normalized.rows, []);
}

for (const dataQuality of ["ok", "partial", "missing", undefined] as const) {
  const row = dataQuality === undefined ? { code: "8136" } : { code: "8136", dataQuality };
  const normalized = normalizeSourceHealthScoreRows([row]);
  assert.equal(normalized.valid, true, `${String(dataQuality)} remains compatible with the canonical DataQuality contract`);
}

console.log("source health data quality: canonical enum only OK");
