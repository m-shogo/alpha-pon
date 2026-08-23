import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHealthArray } from "../src/health/array-health.js";

test("accepts only array-shaped health evidence", () => {
  assert.deepEqual(normalizeHealthArray([]), []);
  assert.deepEqual(normalizeHealthArray([{ code: "8136" }]), [{ code: "8136" }]);
});

test("fails closed on array-like non-array health evidence", () => {
  assert.equal(normalizeHealthArray(undefined), null);
  assert.equal(normalizeHealthArray(null), null);
  assert.equal(normalizeHealthArray({ length: 5 }), null);
  assert.equal(normalizeHealthArray("broken"), null);
});
