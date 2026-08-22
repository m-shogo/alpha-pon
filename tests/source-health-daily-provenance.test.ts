import assert from "node:assert/strict";
import { normalizeSourceHealthObject } from "../src/source-health-input.js";

const canonical = {
  runType: "daily",
  status: "ok",
  date: "2026-08-22",
  generatedAt: "2026-08-22T12:00:00+09:00",
  results: [],
  failedSteps: [],
};

assert.equal(normalizeSourceHealthObject(canonical).valid, true, "canonical daily pipeline provenance remains valid");
assert.equal(normalizeSourceHealthObject({ ...canonical, date: undefined }).valid, false, "daily ok status without date must fail closed");
assert.equal(normalizeSourceHealthObject({ ...canonical, generatedAt: undefined }).valid, false, "daily ok status without generatedAt must fail closed");
assert.equal(normalizeSourceHealthObject({ ...canonical, generatedAt: "2026-08-21T23:59:59+09:00" }).valid, false, "generatedAt must match the pipeline JST date");
assert.equal(normalizeSourceHealthObject({ ...canonical, generatedAt: "2999-08-22T12:00:00+09:00", date: "2999-08-22" }).valid, false, "future daily provenance must fail closed");

const partialFailure = {
  ...canonical,
  status: "partial_failed",
  results: [{ name: "scan_universe", status: "fail" }],
  failedSteps: ["scan_universe"],
};
assert.equal(normalizeSourceHealthObject(partialFailure).valid, true, "canonical partial failure remains valid");
assert.equal(normalizeSourceHealthObject({ ...partialFailure, generatedAt: undefined }).valid, false, "partial failure also requires generatedAt provenance");

console.log("source-health-daily-provenance.test.ts passed");
