import assert from "node:assert/strict";
import { normalizeStaleHypothesisConfig } from "../src/stale-hypothesis-config-input.js";

const valid = normalizeStaleHypothesisConfig({
  categories: {
    theme: {
      label: "Theme",
      companies: [
        { code: "8136", name: "Sample", status: "active", lastReviewedAt: "2026-08-01" },
      ],
    },
  },
});
assert.equal(valid.warnings.length, 0);
assert.deepEqual(valid.categories, [{
  label: "Theme",
  companies: [{ code: "8136", name: "Sample", status: "active", lastReviewedAt: "2026-08-01" }],
}]);

for (const malformedRoot of [null, [], "broken", { categories: null }]) {
  const normalized = normalizeStaleHypothesisConfig(malformedRoot);
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
});
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
});
assert.deepEqual(malformedOptionalFields.categories[0]?.companies, [{ code: "8136", name: "Sample" }]);
assert.equal(malformedOptionalFields.warnings.length, 2);

console.log("stale-hypothesis-config-input.test.ts passed");
