import assert from "node:assert/strict";
import { normalizeGeneratedArrayInput } from "../apps/web/lib/generated-array-input.js";

type HypothesisRow = Record<string, unknown>;

const isHypothesisRow = (value: unknown): value is HypothesisRow => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.code === "string"
    && typeof row.status === "string"
    && ["open", "closed"].includes(row.status)
    && typeof row.confidence === "number"
    && Number.isFinite(row.confidence)
    && typeof row.detectedAt === "string"
    && typeof row.reviewDueAt === "string";
};

const canonical = {
  schemaVersion: 1,
  code: "8136",
  name: "サンリオ",
  detectedAt: "2026-08-18",
  reviewDueAt: "2026-09-18",
  reason: "確認対象",
  expectedTimeframe: "1m",
  expectedDirection: "unknown",
  confidence: 0.7,
  invalidationSignals: ["下方修正"],
  evidenceNeeded: ["一次情報"],
  relatedWorldEventIds: [],
  relatedDisclosureIds: [],
  status: "open",
  label: "検証候補",
};

const valid = normalizeGeneratedArrayInput([canonical], "hypothesisPredictions", isHypothesisRow);
assert.equal(valid.rows.length, 1, "canonical hypothesis prediction must remain usable");
assert.equal(valid.warning, null, "canonical hypothesis prediction must not emit warnings");

for (const [field, malformed] of [
  ["invalidationSignals", "broken"],
  ["evidenceNeeded", { malformed: true }],
  ["relatedWorldEventIds", null],
  ["relatedDisclosureIds", ["ok", 1]],
] as const) {
  const result = normalizeGeneratedArrayInput(
    [canonical, { ...canonical, [field]: malformed }],
    "hypothesisPredictions",
    isHypothesisRow,
  );
  assert.equal(result.rows.length, 1, `${field} contract violation must be isolated before read-only UI iteration`);
  assert.equal(result.rows[0]?.code, "8136", "valid sibling hypothesis must remain usable");
  assert.equal(result.warning, "hypothesisPredictions: invalid_entries (1)", "malformed hypothesis row must remain visible as metadata-only warning");
}

console.log("generated hypothesis prediction input tests passed");
