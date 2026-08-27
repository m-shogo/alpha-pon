import assert from "node:assert/strict";
import {
  countCompanyCoverageWarnings,
  countOnboardingUnknownThinEvidence,
  countStaleHypothesisWarnings,
} from "../src/stock-pro-improvement-roadmap-input.js";

const onboardingWithOnlyRuleMention = `# alpha-pon company onboarding audit

date: 2026-08-27

## company coverage

| coverage | code | name | category | missing | advice |
|---|---|---|---|---|---|
| covered | 8136 | sample | test | valuation_range_check | ok |

## rule
- unknown_or_thin は、具体的な上昇/下落判断をしない
`;
assert.deepEqual(countOnboardingUnknownThinEvidence(onboardingWithOnlyRuleMention), { valid: true, count: 0 });

const onboardingWithEvidence = onboardingWithOnlyRuleMention.replace(
  "| covered | 8136 | sample | test | valuation_range_check | ok |",
  "| unknown_or_thin | 8136 | sample | test | company_network | thin |",
);
assert.deepEqual(countOnboardingUnknownThinEvidence(onboardingWithEvidence), { valid: true, count: 1 });
assert.deepEqual(countOnboardingUnknownThinEvidence("unknown_or_thin only"), { valid: false, count: 0 });

const coverageWithOnlyHeadings = `# alpha-pon company coverage audit

date: 2026-08-27

## summary

- health status: ok
- input warnings: 0
- hypothesis companies: 2
- network companies: 2
- hypothesis missing network: 0
- network missing hypothesis: 0

## warning: hypothesis exists but network is missing
- none
## caution: network exists but hypothesis is missing
- none
`;
assert.deepEqual(countCompanyCoverageWarnings(coverageWithOnlyHeadings), { valid: true, count: 0 });

const coverageWithEvidence = coverageWithOnlyHeadings
  .replace("- hypothesis missing network: 0", "- hypothesis missing network: 2")
  .replace("- network missing hypothesis: 0", "- network missing hypothesis: 1");
assert.deepEqual(countCompanyCoverageWarnings(coverageWithEvidence), { valid: true, count: 3 });
assert.deepEqual(
  countCompanyCoverageWarnings(coverageWithOnlyHeadings.replace("- hypothesis missing network: 0", "- hypothesis missing network: NaN")),
  { valid: false, count: 0 },
);

const staleWithOnlyRuleMentions = `# alpha-pon stale / retired hypothesis report

date: 2026-08-27

| action | category | code | name | ageDays | misses | topReason | status |
|---|---|---|---|---:|---:|---|---|
| ok | all | - | - | 0 | 0 | - | active |

## rule
- 120日以上レビューなし: review_needed
- 365日以上レビューなし: retire_or_rewrite
- 同じ銘柄で外れ理由2回以上: review_repeated_miss
- 同じ銘柄で外れ理由3回以上: retire_or_rewrite_repeated_miss
`;
assert.deepEqual(countStaleHypothesisWarnings(staleWithOnlyRuleMentions), { valid: true, count: 0 });

const staleWithEvidence = staleWithOnlyRuleMentions.replace(
  "| ok | all | - | - | 0 | 0 | - | active |",
  "| review_needed | entertainment | 8136 | sample | 121 | 0 | N/A | active |",
);
assert.deepEqual(countStaleHypothesisWarnings(staleWithEvidence), { valid: true, count: 1 });
assert.deepEqual(
  countStaleHypothesisWarnings(staleWithOnlyRuleMentions.replace("| ok | all | - | - | 0 | 0 | - | active |", "| bogus | all | - | - | 0 | 0 | - | active |")),
  { valid: false, count: 0 },
);
assert.deepEqual(countStaleHypothesisWarnings("review_needed only"), { valid: false, count: 0 });

console.log("stock pro improvement roadmap input tests passed");
