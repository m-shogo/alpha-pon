import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSpecialOpsActionItems,
  normalizeSpecialOpsHealthStatus,
} from "../src/health/special-ops-health-status.js";

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

test("accepts only array-shaped special ops action items", () => {
  assert.deepEqual(normalizeSpecialOpsActionItems([]), []);
  assert.deepEqual(
    normalizeSpecialOpsActionItems([
      { priority: "urgent", title: "Review", command: "pnpm ops:special" },
    ]),
    [{ priority: "urgent", title: "Review", command: "pnpm ops:special" }]
  );
});

test("fails closed on malformed special ops action items", () => {
  assert.equal(normalizeSpecialOpsActionItems(undefined), null);
  assert.equal(normalizeSpecialOpsActionItems(null), null);
  assert.equal(normalizeSpecialOpsActionItems({}), null);
  assert.equal(normalizeSpecialOpsActionItems("broken"), null);
  assert.equal(normalizeSpecialOpsActionItems([null]), null);
  assert.equal(normalizeSpecialOpsActionItems(["urgent"]), null);
});
