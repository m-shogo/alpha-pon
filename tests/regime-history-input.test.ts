import assert from "node:assert/strict";
import { resolveRegimeHistoryAsOf } from "../src/regime-history-input.js";

assert.equal(resolveRegimeHistoryAsOf(undefined, "2026-08-20"), "2026-08-20", "missing asOf remains backward-compatible with the current history date");
assert.equal(resolveRegimeHistoryAsOf("2026-06-03", "2026-08-20"), "2026-06-03", "historical current-regime provenance remains valid");
assert.equal(resolveRegimeHistoryAsOf("2026-08-20", "2026-08-20"), "2026-08-20", "same-day regime provenance remains valid");

for (const invalid of ["2026-02-31", "0000-01-01", "2026-8-20", "2026-08-20T00:00:00+09:00"] as const) {
  assert.throws(
    () => resolveRegimeHistoryAsOf(invalid, "2026-08-20"),
    /current regime asOf must be/,
    `invalid regime provenance must fail closed: ${invalid}`,
  );
}

assert.throws(
  () => resolveRegimeHistoryAsOf("2026-08-21", "2026-08-20"),
  /must not be after the history date/,
  "future regime provenance must not enter a current read-only history snapshot",
);

console.log("regime history input: invalid or future asOf fails closed OK");
