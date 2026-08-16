import assert from "node:assert/strict";
import { normalizeOpsOutcomesInput } from "../src/ops-dashboard-outcomes-input.js";

const valid = {
  outcomes: [
    {
      code: "8136",
      reviewHorizon: "1m",
      result: "hit",
      dataAvailability: "ok",
    },
  ],
};

assert.deepEqual(normalizeOpsOutcomesInput(valid), valid);
assert.equal(normalizeOpsOutcomesInput(null), null);

for (const malformed of [
  [],
  {},
  { outcomes: {} },
  { outcomes: [null] },
  { outcomes: ["broken"] },
  { outcomes: [{ result: 1 }] },
  { outcomes: [{ dataAvailability: [] }] },
]) {
  const normalized = normalizeOpsOutcomesInput(malformed);
  assert.equal(normalized?.outcomes.length, 1);
  assert.equal(normalized?.outcomes[0]?.result, "unevaluated");
  assert.equal(normalized?.outcomes[0]?.dataAvailability, "unknown");
}

console.log("ops-dashboard outcomes input: malformed input fails closed OK");
