import assert from "node:assert/strict";
import {
  normalizeCompanyOnboardingNetworkCompanies,
  normalizeCompanyOnboardingPolicy,
} from "../src/company-onboarding-input.js";

assert.deepEqual(
  normalizeCompanyOnboardingNetworkCompanies(null),
  { companies: {}, warnings: ["company-network.yml root shape is invalid"] },
  "null network root must fail closed before onboarding coverage reads companies",
);
assert.deepEqual(
  normalizeCompanyOnboardingNetworkCompanies({ companies: [] }),
  { companies: {}, warnings: ["company-network.yml companies shape is invalid"] },
  "non-object network companies must fail closed",
);
assert.deepEqual(
  normalizeCompanyOnboardingNetworkCompanies({ companies: { "8136": { peers: ["7974"] } } }),
  { companies: { "8136": { peers: ["7974"] } }, warnings: [] },
  "canonical network company map remains usable",
);

assert.deepEqual(
  normalizeCompanyOnboardingPolicy(null),
  { checks: [], warnings: ["company-onboarding-policy.yml root shape is invalid"] },
  "null policy root must fail closed before mandatoryChecks access",
);
assert.deepEqual(
  normalizeCompanyOnboardingPolicy({ mandatoryChecks: {} }),
  { checks: [], warnings: ["company-onboarding-policy.yml mandatoryChecks shape is invalid"] },
  "malformed mandatoryChecks remains visible without crashing the audit",
);
assert.deepEqual(
  normalizeCompanyOnboardingPolicy({ mandatoryChecks: [
    { id: "primary_ir", label: "Primary IR", why: "Confirm company evidence" },
  ] }),
  {
    checks: [{ id: "primary_ir", label: "Primary IR", why: "Confirm company evidence" }],
    warnings: [],
  },
  "canonical policy root remains usable",
);

console.log("company-onboarding-root-input.test.ts passed");
