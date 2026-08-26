import assert from "node:assert/strict";
import {
  normalizeCompanyCoverageRoots,
  normalizeCompanyCoverageRows,
  normalizeCompanyHypothesesRoot,
} from "../src/company-coverage-input.js";
import { normalizeCompanyHypothesisReportRows } from "../src/company-hypothesis-report-input.js";
import {
  hasCanonicalStringItems,
  normalizeCompanyOnboardingCompanies,
  normalizeCompanyOnboardingPolicyChecks,
} from "../src/company-onboarding-input.js";
import { normalizeProIrEventInput } from "../src/pro-ir-event-input.js";
import {
  normalizeActiveRegimeCategoryIds,
  normalizeAlignmentHypothesisCategories,
} from "../src/regime-hypothesis-alignment-input.js";

assert.equal(hasCanonicalStringItems(["IR", "earnings", "valuation"], 3), true);
assert.equal(hasCanonicalStringItems("IR earnings valuation", 3), false, "string length must not satisfy evidence list coverage");
assert.equal(hasCanonicalStringItems(["peer-a", "peer-b"], 2), true);
assert.equal(hasCanonicalStringItems("peer-a", 2), false, "string length must not satisfy peer list coverage");
assert.equal(hasCanonicalStringItems(["peer-a", " peer-b "], 2), false, "noncanonical list values fail closed");

const validOnboardingPolicy = normalizeCompanyOnboardingPolicyChecks([
  { id: "primary_ir", label: "Primary IR", why: "Confirm company evidence" },
]);
assert.deepEqual(validOnboardingPolicy.checks, [
  { id: "primary_ir", label: "Primary IR", why: "Confirm company evidence" },
], "canonical onboarding policy checks remain usable");
assert.deepEqual(validOnboardingPolicy.warnings, []);
assert.deepEqual(
  normalizeCompanyOnboardingPolicyChecks({ primary_ir: true }),
  { checks: [], warnings: ["company-onboarding-policy.yml mandatoryChecks shape is invalid"] },
  "non-array mandatoryChecks must not reach onboarding report iteration",
);
const malformedOnboardingPolicy = normalizeCompanyOnboardingPolicyChecks([
  { id: "primary_ir", label: "Primary IR", why: "Confirm company evidence" },
  { id: " primary_ir ", label: "duplicate", why: "duplicate" },
  null,
]);
assert.deepEqual(malformedOnboardingPolicy.checks, [
  { id: "primary_ir", label: "Primary IR", why: "Confirm company evidence" },
], "malformed onboarding checks are isolated without dropping canonical rows");
assert.equal(malformedOnboardingPolicy.warnings.length, 2, "malformed onboarding policy rows remain visible as warnings");

const malformedOnboardingCompanies = normalizeCompanyOnboardingCompanies({
  healthy: {
    companies: [
      { code: "8136", name: "サンリオ", evidenceToCheck: ["IR"], relatedCompanies: ["7974"] },
      { code: "8136", name: "duplicate" },
      null,
    ],
  },
  brokenCategory: null,
  brokenCompanies: { companies: {} },
});
assert.deepEqual(malformedOnboardingCompanies.companies, [{
  categoryId: "healthy",
  code: "8136",
  name: "サンリオ",
  evidenceToCheck: ["IR"],
  relatedCompanies: ["7974"],
}], "malformed onboarding category/company rows must not reach report iteration");
assert.ok(malformedOnboardingCompanies.warnings.some(warning => warning.includes("canonical identity is duplicated")));
assert.ok(malformedOnboardingCompanies.warnings.some(warning => warning.includes("brokenCategory")));
assert.ok(malformedOnboardingCompanies.warnings.some(warning => warning.includes("brokenCompanies")));
assert.deepEqual(
  normalizeCompanyOnboardingCompanies([]),
  { companies: [], warnings: ["company-hypotheses.yml categories shape is invalid"] },
  "non-object categories must fail closed before onboarding iteration",
);

const malformedOnboardingIr = normalizeProIrEventInput({
  companies: {
    "8136": { name: "Sanrio", events: {} },
    "7203": { name: "Toyota", events: [{ type: "earnings", date: "2026-08-20" }] },
  },
});
assert.equal(malformedOnboardingIr.companies["8136"], undefined, "non-array IR events must not reach onboarding coverage iteration");
assert.equal(malformedOnboardingIr.companies["7203"]?.events.length, 1, "valid peer IR events remain usable when another company is malformed");
assert.equal(malformedOnboardingIr.invalidCompanyCount, 1, "malformed IR company input remains visible as metadata warning");

const input = normalizeCompanyHypothesesRoot({
  categories: {
    healthy: {
      label: " Healthy ",
      thesis: " Thesis ",
      companies: [
        {
          code: " 8136 ",
          name: " サンリオ ",
          role: " IP ",
          status: " active ",
          upsideHypothesis: " upside ",
          noMoveHypothesis: " no move ",
          downsideHypothesis: " downside ",
          notGoodWhen: {},
          relatedCompanies: [" 7974 任天堂 "],
          evidenceToCheck: [" IR "],
          nonMoveReasonCandidates: [" already_priced_in "],
          lastReviewedAt: " 2026-05-30 ",
        },
        {
          code: "8136",
          name: "duplicate",
          role: "duplicate",
          status: "watch",
          upsideHypothesis: "duplicate upside",
          noMoveHypothesis: "duplicate no move",
          downsideHypothesis: "duplicate downside",
        },
        null,
      ],
    },
    brokenCategory: null,
    brokenCompanies: { label: "Broken", thesis: "Broken", companies: {} },
  },
});

const normalized = normalizeCompanyHypothesisReportRows(input, "2026-06-11");
assert.deepEqual(normalized.categories.healthy, {
  label: "Healthy",
  thesis: "Thesis",
  companies: [{
    code: "8136",
    name: "サンリオ",
    role: "IP",
    status: "active",
    upsideHypothesis: "upside",
    noMoveHypothesis: "no move",
    downsideHypothesis: "downside",
    notGoodWhen: [],
    relatedCompanies: ["7974 任天堂"],
    evidenceToCheck: ["IR"],
    nonMoveReasonCandidates: ["already_priced_in"],
    lastReviewedAt: "2026-05-30",
  }],
}, "壊れたnested field/company rowとcanonical duplicateを隔離しつつ先行companyを保持する");
assert.equal(normalized.categories.brokenCategory, undefined, "null categoryを隔離する");
assert.deepEqual(normalized.categories.brokenCompanies.companies, [], "non-array companiesを空配列へ隔離する");
assert.ok(normalized.warnings.some(warning => warning.includes("notGoodWhen")), "壊れたlist fieldをwarningへ残す");
assert.ok(normalized.warnings.some(warning => warning.includes("canonical identity is duplicated")), "canonical duplicateをwarningへ残す");
assert.ok(normalized.warnings.some(warning => warning.includes("company row 3")), "null company rowをwarningへ残す");
assert.ok(normalized.warnings.some(warning => warning.includes("brokenCategory")), "null categoryをwarningへ残す");
assert.ok(normalized.warnings.some(warning => warning.includes("brokenCompanies")), "壊れたcompanies fieldをwarningへ残す");

const invalidReviewDates = normalizeCompanyHypothesisReportRows(normalizeCompanyHypothesesRoot({
  categories: {
    dates: {
      label: "Dates",
      thesis: "Date provenance",
      companies: [
        {
          code: "7974",
          name: "Nintendo",
          role: "peer",
          status: "watch",
          upsideHypothesis: "upside",
          noMoveHypothesis: "flat",
          downsideHypothesis: "downside",
          lastReviewedAt: "2026-02-31",
        },
        {
          code: "6758",
          name: "Sony",
          role: "peer",
          status: "watch",
          upsideHypothesis: "upside",
          noMoveHypothesis: "flat",
          downsideHypothesis: "downside",
          lastReviewedAt: "2999-01-01",
        },
      ],
    },
  },
}), "2026-06-11");
assert.equal(invalidReviewDates.categories.dates.companies[0].lastReviewedAt, undefined, "不存在日をreview provenanceへ通さない");
assert.equal(invalidReviewDates.categories.dates.companies[1].lastReviewedAt, undefined, "未来review日を現在のprovenanceへ通さない");
assert.equal(invalidReviewDates.warnings.filter(warning => warning.includes("lastReviewedAt is invalid")).length, 2);

const coverage = normalizeCompanyCoverageRows(normalizeCompanyCoverageRoots(
  {
    categories: {
      healthy: {
        label: "Healthy",
        companies: [
          { code: "8136", name: "サンリオ", status: "active" },
          { code: " 8136 ", name: "duplicate", status: "watch" },
        ],
      },
    },
  },
  { companies: {} },
));
assert.deepEqual(
  coverage.categories.healthy.companies,
  [{ code: "8136", name: "サンリオ", status: "active" }],
  "同一categoryのcanonical company identity重複は先行rowだけを保持する",
);
assert.ok(
  coverage.warnings.some(warning => warning.includes("category healthy company 8136 canonical identity is duplicated")),
  "canonical company identity重複はsilent dropせずwarningへ残す",
);

const regime = normalizeActiveRegimeCategoryIds({
  activeRegimes: [
    { watchCategories: [" healthy ", null] },
    null,
    { watchCategories: {} },
  ],
});
assert.deepEqual(regime.categoryIds, ["healthy"], "壊れたregime rowの周囲でも正常categoryを保持する");
assert.ok(regime.warnings.some(warning => warning.includes("item 2")), "壊れたwatch categoryをwarningへ残す");
assert.ok(regime.warnings.some(warning => warning.includes("row 2")), "null regime rowをwarningへ残す");
assert.ok(regime.warnings.some(warning => warning.includes("watchCategories shape")), "壊れたwatchCategoriesをwarningへ残す");

const malformedRegimeCollection = normalizeActiveRegimeCategoryIds({ activeRegimes: {} });
assert.deepEqual(malformedRegimeCollection.categoryIds, [], "non-array activeRegimesは空の監視categoryへfail-closedする");
assert.ok(
  malformedRegimeCollection.warnings.some(warning => warning.includes("activeRegimes shape is invalid")),
  "non-array activeRegimesをsilentに正常化せずwarningへ残す",
);

const futureRegime = normalizeActiveRegimeCategoryIds({
  asOf: "2999-01-01",
  activeRegimes: [{ watchCategories: ["healthy"] }],
}, "2026-06-11");
assert.deepEqual(futureRegime.categoryIds, [], "未来regimeから現在のactive categoryを採用しない");
assert.ok(
  futureRegime.warnings.some(warning => warning.includes("asOf provenance is invalid or future")),
  "未来regime provenanceをwarningへ残す",
);

const invalidRegimeDate = normalizeActiveRegimeCategoryIds({
  asOf: "2026-02-31",
  activeRegimes: [{ watchCategories: ["healthy"] }],
}, "2026-06-11");
assert.deepEqual(invalidRegimeDate.categoryIds, [], "不存在日regimeからactive categoryを採用しない");

const alignment = normalizeAlignmentHypothesisCategories(normalizeCompanyHypothesesRoot({
  categories: {
    healthy: {
      label: " Healthy ",
      companies: [
        { code: " 8136 ", name: " サンリオ ", status: " active " },
        { code: "8136", name: "duplicate", status: "watch" },
        null,
      ],
    },
    brokenCategory: null,
    brokenCompanies: { label: "Broken", companies: {} },
  },
}));
assert.deepEqual(alignment.categories.healthy, {
  label: "Healthy",
  companies: [{ code: "8136", name: "サンリオ", status: "active" }],
}, "alignmentはcanonical duplicateと壊れたcompany rowを隔離し先行companyを保持する");
assert.equal(alignment.categories.brokenCategory, undefined, "alignmentでもnull categoryを隔離する");
assert.deepEqual(alignment.categories.brokenCompanies.companies, [], "alignmentでもnon-array companiesを隔離する");
assert.ok(alignment.warnings.some(warning => warning.includes("canonical identity is duplicated")), "alignmentのcanonical duplicateをwarningへ残す");
assert.ok(alignment.warnings.some(warning => warning.includes("company row 3")), "alignmentのnull companyをwarningへ残す");

console.log("company-hypothesis-report-input.test.ts passed");
