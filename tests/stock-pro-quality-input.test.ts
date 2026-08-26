import assert from "node:assert/strict";
import { normalizeStockProQualityInputs } from "../src/stock-pro-quality-input.js";

const malformedRoots = normalizeStockProQualityInputs(null, null, null, null, "2026-08-26");
assert.deepEqual(malformedRoots.categories, {}, "malformed hypothesis root must not reach quality report iteration");
assert.deepEqual(malformedRoots.networkCompanies, {}, "malformed network root must not reach quality gate checks");
assert.deepEqual(malformedRoots.irCompanies, {}, "empty IR root remains non-crashing");
assert.deepEqual(malformedRoots.gates, [], "malformed gate root must not reach gate iteration");
assert.ok(malformedRoots.warnings.some(warning => warning.includes("company-hypotheses.yml root/categories shape is invalid")));
assert.ok(malformedRoots.warnings.some(warning => warning.includes("company-network.yml root/companies shape is invalid")));
assert.ok(malformedRoots.warnings.some(warning => warning.includes("stock-pro-quality-gate.yml root shape is invalid")));

const malformedGateRows = normalizeStockProQualityInputs(
  { categories: {} },
  { companies: {} },
  { companies: {} },
  {
    qualityGates: [
      { id: "primary_source", label: "Primary", severity: "critical", failAction: "hold", proQuestion: "source?" },
      { id: "primary_source", label: "Duplicate", severity: "critical", failAction: "hold", proQuestion: "source?" },
      { id: "bad", label: "Bad", severity: "urgent", failAction: "hold", proQuestion: "bad?" },
      null,
    ],
  },
  "2026-08-26",
);
assert.deepEqual(malformedGateRows.gates, [
  { id: "primary_source", label: "Primary", severity: "critical", failAction: "hold", proQuestion: "source?" },
], "only canonical unique quality gates remain usable");
assert.equal(malformedGateRows.warnings.filter(warning => warning.includes("stock-pro-quality-gate.yml")).length, 3);

console.log("stock-pro-quality-input.test.ts passed");
