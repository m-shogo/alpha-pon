import assert from "node:assert/strict";
import { countInvalidWorldImpactAuditRows } from "../src/world-impact-audit-input.js";

const base = {
  reviewKey: "event__5803",
  eventId: "event",
  eventDate: "2026-06-10",
  createdAt: "2026-06-10",
  updatedAt: "2026-06-12",
  outcomes: [{
    dueAt: "2026-06-11",
    evaluatedAt: "2026-06-12",
    evaluationAsOf: "2026-06-12",
    priceStartDate: "2026-06-10",
    priceEndDate: "2026-06-11",
  }],
};

assert.equal(countInvalidWorldImpactAuditRows([base], "2026-06-12"), 0, "valid JSONL row remains auditable");

for (const [field, invalid] of [
  ["evaluatedAt", "2026-02-31"],
  ["evaluationAsOf", "0000-01-01"],
  ["priceStartDate", "20260610"],
  ["priceEndDate", "2026-02-31"],
] as const) {
  const row = {
    ...base,
    outcomes: [{ ...base.outcomes[0], [field]: invalid }],
  };
  assert.equal(
    countInvalidWorldImpactAuditRows([row], "2026-06-12"),
    1,
    `${field} malformed date must be surfaced as an audit validation error`,
  );
}

console.log("world-impact audit input: malformed JSONL dates fail closed");
