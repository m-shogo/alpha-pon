import { normalizeGeneratedArrayInput } from "../apps/web/lib/generated-array-input.js";

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

console.log("generated array input tests passed");
