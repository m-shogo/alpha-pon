import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHealthArray } from "../src/health/array-health.js";

const canonicalDecision = {
  code: "8136",
  name: "Sanrio",
  finalLabel: "HOLD",
  finalScore: 0.5,
};

test("accepts only canonical committee decision arrays", () => {
  assert.deepEqual(normalizeHealthArray([]), []);
  assert.deepEqual(normalizeHealthArray([canonicalDecision]), [canonicalDecision]);
});

test("fails closed on array-like non-array health evidence", () => {
  assert.equal(normalizeHealthArray(undefined), null);
  assert.equal(normalizeHealthArray(null), null);
  assert.equal(normalizeHealthArray({ length: 5 }), null);
  assert.equal(normalizeHealthArray("broken"), null);
});

test("fails closed when health evidence contains malformed rows", () => {
  assert.equal(normalizeHealthArray([null]), null);
  assert.equal(normalizeHealthArray(["broken"]), null);
  assert.equal(normalizeHealthArray([{}]), null);
  assert.equal(normalizeHealthArray([{ code: "8136" }]), null);
  assert.equal(normalizeHealthArray([{ ...canonicalDecision, finalScore: Number.NaN }]), null);
  assert.equal(normalizeHealthArray([canonicalDecision, { bogus: true }]), null);
});
