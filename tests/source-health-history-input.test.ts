import assert from "node:assert/strict";
import { normalizeSourceHealthHistoryRows } from "../src/source-health-history-input.js";

const normalized = normalizeSourceHealthHistoryRows([
  { date: "2026-08-16", reports: { scores: { exists: true, size: 42 } } },
  null,
  "broken",
  { date: "2026-08-15", reports: [] },
  { date: "2026-08-14", reports: { scores: null } },
]);

assert.equal(normalized.rows.length, 1, "valid source-health rows must remain available");
assert.equal(normalized.invalidRows, 4, "malformed JSON values must be isolated and counted");
assert.deepEqual(normalized.rows[0], {
  date: "2026-08-16",
  reports: { scores: { exists: true, size: 42 } },
});

const optionalReports = normalizeSourceHealthHistoryRows([{ date: "2026-08-16" }]);
assert.equal(optionalReports.rows.length, 1, "rows without reports remain compatible with existing history data");
assert.equal(optionalReports.invalidRows, 0);

console.log("source health history input: malformed rows fail closed without stopping valid history OK");
