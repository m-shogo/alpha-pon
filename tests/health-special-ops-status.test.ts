import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSpecialOpsHealthStatus } from "../src/health/special-ops-health-status.js";

test("accepts only canonical special ops health statuses", () => {
  assert.equal(normalizeSpecialOpsHealthStatus("ok"), "ok");
  assert.equal(normalizeSpecialOpsHealthStatus("needs_attention"), "needs_attention");
  assert.equal(normalizeSpecialOpsHealthStatus("action_required"), "action_required");
});

test("fails closed on missing or unknown special ops health status", () => {
  assert.equal(normalizeSpecialOpsHealthStatus(undefined), null);
  assert.equal(normalizeSpecialOpsHealthStatus(null), null);
  assert.equal(normalizeSpecialOpsHealthStatus("healthy"), null);
  assert.equal(normalizeSpecialOpsHealthStatus(""), null);
});
