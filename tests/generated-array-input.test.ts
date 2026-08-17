import {
  normalizeGeneratedArrayInput,
  normalizeGeneratedObjectInput,
  normalizeOptionalGeneratedObjectInput,
  normalizeOptionalGeneratedRecordInput,
} from "../apps/web/lib/generated-array-input.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const valid = normalizeGeneratedArrayInput<{ code: string }>([{ code: "8136" }], "companyMemory");
assert(valid.rows.length === 1, "valid generated arrays must remain usable");
assert(valid.warning === null, "valid generated arrays must not emit warnings");

const missing = normalizeGeneratedArrayInput(undefined, "companyMemory");
assert(missing.rows.length === 0, "missing legacy generated fields may remain empty");
assert(missing.warning === null, "missing legacy generated fields must not be mislabeled as corrupt");

for (const malformed of [null, {}, "broken", 1]) {
  const invalid = normalizeGeneratedArrayInput(malformed, "companyMemory");
  assert(invalid.rows.length === 0, "malformed generated arrays must be safely isolated");
  assert(
    invalid.warning === "companyMemory: invalid_root (expected array)",
    "malformed company-memory roots must remain visible as metadata-only warnings",
  );
}

const validRoot = normalizeGeneratedObjectInput({ generatedAt: "2026-08-18" }, "generatedData");
assert(validRoot.object.generatedAt === "2026-08-18", "valid generated roots must remain usable");
assert(validRoot.warning === null, "valid generated roots must not emit warnings");

for (const malformed of [null, [], "broken", 1]) {
  const invalid = normalizeGeneratedObjectInput(malformed, "generatedData");
  assert(Object.keys(invalid.object).length === 0, "malformed generated roots must be safely isolated");
  assert(
    invalid.warning === "generatedData: invalid_root (expected object)",
    "malformed generated roots must remain visible as metadata-only warnings",
  );
}

const missingOptionalObject = normalizeOptionalGeneratedObjectInput(undefined, "dataQualityByCode");
assert(Object.keys(missingOptionalObject.object).length === 0, "missing optional generated objects may remain empty");
assert(missingOptionalObject.warning === null, "missing optional generated objects must not be mislabeled as corrupt");

const validOptionalObject = normalizeOptionalGeneratedObjectInput({ "8136": { dataQuality: "ok" } }, "dataQualityByCode");
assert(Object.keys(validOptionalObject.object).length === 1, "valid optional generated objects must remain usable");
assert(validOptionalObject.warning === null, "valid optional generated objects must not emit warnings");

for (const malformed of [null, [], "broken", 1]) {
  const invalid = normalizeOptionalGeneratedObjectInput(malformed, "dataQualityByCode");
  assert(Object.keys(invalid.object).length === 0, "malformed optional generated objects must be safely isolated");
  assert(
    invalid.warning === "dataQualityByCode: invalid_root (expected object)",
    "malformed data-quality roots must remain visible as metadata-only warnings",
  );
}

const isQualityRow = (value: unknown): value is { dataQuality: string; warnings: string[] } => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.dataQuality === "string"
    && Array.isArray(row.warnings)
    && row.warnings.every((warning) => typeof warning === "string");
};

const mixedRecord = normalizeOptionalGeneratedRecordInput(
  {
    "8136": { dataQuality: "ok", warnings: [] },
    "9999": { dataQuality: "missing" },
  },
  "dataQualityByCode",
  isQualityRow,
);
assert(Object.keys(mixedRecord.record).length === 1, "malformed generated record entries must be isolated individually");
assert(mixedRecord.record["8136"]?.dataQuality === "ok", "valid generated record entries must remain usable");
assert(
  mixedRecord.warning === "dataQualityByCode: invalid_entries (1)",
  "malformed generated record entries must remain visible as metadata-only warnings",
);

const missingRecord = normalizeOptionalGeneratedRecordInput(undefined, "dataQualityByCode", isQualityRow);
assert(Object.keys(missingRecord.record).length === 0, "missing optional generated records may remain empty");
assert(missingRecord.warning === null, "missing optional generated records must not be mislabeled as corrupt");

console.log("generated array input tests passed");
