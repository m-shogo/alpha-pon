import assert from "node:assert/strict";
import {
  normalizeCompanyCoverageRoots,
  normalizeCompanyCoverageRows,
  normalizeCompanyHypothesesRoot,
} from "../src/company-coverage-input.js";
import { normalizeCompanyHypothesisReportRows } from "../src/company-hypothesis-report-input.js";
import {
  normalizeActiveRegimeCategoryIds,
  normalizeAlignmentHypothesisCategories,
} from "../src/regime-hypothesis-alignment-input.js";

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
