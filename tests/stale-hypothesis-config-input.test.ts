import assert from "node:assert/strict";
import { normalizeStaleHypothesisConfig } from "../src/stale-hypothesis-config-input.js";

const AS_OF = "2026-08-27";

const valid = normalizeStaleHypothesisConfig({
  categories: {
    theme: {
      label: "Theme",
      companies: [
        { code: "8136", name: "Sample", status: "active", lastReviewedAt: "2026-08-01" },
      ],
    },
  },
}, AS_OF);
assert.equal(valid.warnings.length, 0);
assert.deepEqual(valid.categories, [{
  label: "Theme",
  companies: [{ code: "8136", name: "Sample", status: "active", lastReviewedAt: "2026-08-01" }],
}]);

for (const malformedRoot of [null, [], "broken", { categories: null }]) {
  const normalized = normalizeStaleHypothesisConfig(malformedRoot, AS_OF);
  assert.deepEqual(normalized.categories, []);
  assert.ok(normalized.warnings.length > 0, "malformed root must fail closed with a warning");
}

const malformedCollections = normalizeStaleHypothesisConfig({
  categories: {
    brokenCategory: null,
    brokenCompanies: { label: "Broken", companies: {} },
    mixed: {
      label: "Mixed",
      companies: [
        null,
        { code: " 8136 ", name: "Padded" },
        { code: "8136", name: "First" },
        { code: "8136", name: "Duplicate" },
        { code: "7974", name: "Valid" },
      ],
    },
  },
}, AS_OF);
assert.ok(malformedCollections.warnings.length >= 4);
assert.deepEqual(malformedCollections.categories, [
  { label: "Mixed", companies: [{ code: "8136", name: "First" }, { code: "7974", name: "Valid" }] },
]);

const malformedOptionalFields = normalizeStaleHypothesisConfig({
  categories: {
    theme: {
      label: "Theme",
      companies: [{ code: "8136", name: "Sample", status: " active ", lastReviewedAt: " 2026-08-01 " }],
    },
  },
}, AS_OF);
assert.deepEqual(malformedOptionalFields.categories[0]?.companies, [{ code: "8136", name: "Sample" }]);
assert.equal(malformedOptionalFields.warnings.length, 2);

for (const invalidStatus of ["unknown", "WATCH", "retierd", " retired "]) {
  const normalized = normalizeStaleHypothesisConfig({
    categories: {
      theme: {
        label: "Theme",
        companies: [{ code: "8136", name: "Sample", status: invalidStatus }],
      },
    },
  }, AS_OF);
  assert.deepEqual(normalized.categories[0]?.companies, [{ code: "8136", name: "Sample" }]);
  assert.equal(normalized.warnings.length, 1, `${invalidStatus} must fail closed`);
}

for (const validStatus of ["active", "watch", "stale", "retired"]) {
  const normalized = normalizeStaleHypothesisConfig({
    categories: {
      theme: {
        label: "Theme",
        companies: [{ code: "8136", name: "Sample", status: validStatus }],
      },
    },
  }, AS_OF);
  assert.equal(normalized.warnings.length, 0);
  assert.equal(normalized.categories[0]?.companies[0]?.status, validStatus);
}

for (const invalidReviewDate of ["2026-02-31", "0000-01-01", "2026-08-28", "2026-08-01T00:00:00+09:00"]) {
  const normalized = normalizeStaleHypothesisConfig({
    categories: {
      theme: {
        label: "Theme",
        companies: [{ code: "8136", name: "Sample", lastReviewedAt: invalidReviewDate }],
      },
    },
  }, AS_OF);
  assert.deepEqual(normalized.categories[0]?.companies, [{ code: "8136", name: "Sample" }]);
  assert.equal(normalized.warnings.length, 1, `${invalidReviewDate} must fail closed`);
}

console.log("stale-hypothesis-config-input.test.ts passed");
