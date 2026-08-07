import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { RECOMMENDATION_PATHS } from "../../src/research/recommendation-persistence.js";
import { QUANTITATIVE_OUTCOME_PATHS } from "../../src/research/quantitative-outcome.js";
import { CORPORATE_ACTION_CLEARANCE_PATHS } from "../../src/research/corporate-action-clearance.js";
import { OUTCOME_SEMANTIC_REVIEW_PATHS } from "../../src/research/outcome-semantic-review.js";
import { OUTCOME_LEARNING_PROPOSAL_PATHS } from "../../src/research/outcome-learning-proposal.js";
import { OUTCOME_LEARNING_DECISION_PATHS } from "../../src/research/outcome-learning-decision.js";
import { OUTCOME_LEARNING_SHADOW_EVALUATION_PATHS } from "../../src/research/outcome-learning-shadow-evaluation.js";
import { OUTCOME_LEARNING_ADOPTION_DECISION_PATHS } from "../../src/research/outcome-learning-adoption-decision.js";
import { OUTCOME_LEARNING_CHANGE_PREPARATION_PATHS } from "../../src/research/outcome-learning-change-preparation.js";

const runtimePaths = [
  RECOMMENDATION_PATHS.records,
  QUANTITATIVE_OUTCOME_PATHS.records,
  CORPORATE_ACTION_CLEARANCE_PATHS.records,
  OUTCOME_SEMANTIC_REVIEW_PATHS.records,
  OUTCOME_LEARNING_PROPOSAL_PATHS.records,
  OUTCOME_LEARNING_DECISION_PATHS.records,
  OUTCOME_LEARNING_SHADOW_EVALUATION_PATHS.records,
  OUTCOME_LEARNING_ADOPTION_DECISION_PATHS.records,
  OUTCOME_LEARNING_CHANGE_PREPARATION_PATHS.records,
];

for (const path of runtimePaths) {
  assert.match(path, /^research\/(?:recommendations|corporate-actions)\/[^/]+\.jsonl$/);
  assert.doesNotThrow(
    () => execFileSync("git", ["check-ignore", "-q", "--no-index", path], { stdio: "ignore" }),
    `runtime record path must be ignored by Git: ${path}`,
  );
}

assert.equal(new Set(runtimePaths).size, runtimePaths.length, "runtime record paths must be unique");
console.log("recommendation-runtime-local-only: all governed runtime JSONL paths are Git-ignored OK");
console.log("recommendation-runtime-local-only.test.ts passed");
