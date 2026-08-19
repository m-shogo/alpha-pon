import assert from "node:assert/strict";
import { normalizeRegimeHistoryActiveRegimes, resolveRegimeHistoryAsOf } from "../src/regime-history-input.js";

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

assert.deepEqual(
  normalizeRegimeHistoryActiveRegimes([
    {
      id: "risk-off",
      level: "high",
      why: "macro stress",
      watchCategories: ["rates"],
      caution: ["liquidity"],
    },
  ]),
  [
    {
      id: "risk-off",
      level: "high",
      why: "macro stress",
      watchCategories: ["rates"],
      caution: ["liquidity"],
    },
  ],
  "canonical active-regime rows must remain available",
);
assert.deepEqual(normalizeRegimeHistoryActiveRegimes(undefined), [], "missing active regimes remain backward-compatible");

for (const invalid of [
  "broken",
  [null],
  [{ id: "risk-off", level: "high", why: "macro stress", watchCategories: "rates" }],
  [{ id: "", level: "high", why: "macro stress" }],
] as const) {
  assert.throws(
    () => normalizeRegimeHistoryActiveRegimes(invalid),
    /current regime activeRegimes/,
    "malformed active-regime provenance must fail closed before history append",
  );
}

console.log("regime history input: invalid or future provenance fails closed OK");
