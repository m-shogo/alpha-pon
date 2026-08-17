import assert from "node:assert/strict";
import { normalizeCompanyHypothesesRoot } from "../src/company-coverage-input.js";
import { normalizeCompanyHypothesisReportRows } from "../src/company-hypothesis-report-input.js";

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
        null,
      ],
    },
    brokenCategory: null,
    brokenCompanies: { label: "Broken", thesis: "Broken", companies: {} },
  },
});

const normalized = normalizeCompanyHypothesisReportRows(input);
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
}, "壊れたnested field/company rowを隔離しつつ正常companyを保持する");
assert.equal(normalized.categories.brokenCategory, undefined, "null categoryを隔離する");
assert.deepEqual(normalized.categories.brokenCompanies.companies, [], "non-array companiesを空配列へ隔離する");
assert.ok(normalized.warnings.some(warning => warning.includes("notGoodWhen")), "壊れたlist fieldをwarningへ残す");
assert.ok(normalized.warnings.some(warning => warning.includes("company row 2")), "null company rowをwarningへ残す");
assert.ok(normalized.warnings.some(warning => warning.includes("brokenCategory")), "null categoryをwarningへ残す");
assert.ok(normalized.warnings.some(warning => warning.includes("brokenCompanies")), "壊れたcompanies fieldをwarningへ残す");

console.log("company-hypothesis-report-input.test.ts passed");
