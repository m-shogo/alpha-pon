import assert from "node:assert/strict";
import { normalizeOpsIntegrityInput } from "../src/ops-dashboard-integrity-input.js";

const valid = normalizeOpsIntegrityInput({
  status: "ok",
  jsonl: { duplicateGroups: [], parseErrors: [] },
  sqlite: { duplicateGroups: [] },
});
assert.deepEqual(valid, {
  status: "ok",
  jsonl: { duplicateGroups: [], parseErrors: [] },
  sqlite: { duplicateGroups: [] },
});

for (const malformed of [
  [],
  "broken",
  {},
  { status: "green" },
  { status: "ok", jsonl: [] },
  { status: "ok", jsonl: { duplicateGroups: {} } },
  { status: "ok", jsonl: { parseErrors: "none" } },
  { status: "ok", sqlite: [] },
  { status: "ok", sqlite: { duplicateGroups: "none" } },
]) {
  assert.deepEqual(
    normalizeOpsIntegrityInput(malformed),
    {
      status: "invalid_input",
      jsonl: { duplicateGroups: [], parseErrors: [{}] },
      sqlite: { duplicateGroups: [] },
    },
    "malformed integrity input must fail closed instead of producing false-green counts",
  );
}

assert.equal(normalizeOpsIntegrityInput(null), null, "missing input remains distinguishable from malformed input");

console.log("ops-dashboard integrity input: malformed shapes fail closed OK");
