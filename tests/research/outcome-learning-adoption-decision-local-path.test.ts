import assert from "node:assert/strict";
import { linkSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendOutcomeLearningAdoptionDecisionRecords,
  readOutcomeLearningAdoptionDecisionJsonl,
  type OutcomeLearningAdoptionDecisionContext,
  type OutcomeLearningAdoptionDecisionRecord,
} from "../../src/research/outcome-learning-adoption-decision.js";
import type { JsonSchema } from "../../src/research/schema.js";

const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-adoption-decision-local-path-"));
const target = join(sandbox, "target.jsonl");
writeFileSync(target, "", "utf-8");

const symlinkPath = join(sandbox, "symlink.jsonl");
symlinkSync(target, symlinkPath);
assert.throws(
  () => readOutcomeLearningAdoptionDecisionJsonl(symlinkPath),
  /must not be a symbolic link/,
);
assert.throws(
  () => appendOutcomeLearningAdoptionDecisionRecords({
    path: symlinkPath,
    incoming: [{} as OutcomeLearningAdoptionDecisionRecord],
    schema: {} as JsonSchema,
    context: {} as OutcomeLearningAdoptionDecisionContext,
  }),
  /must not be a symbolic link/,
);

const hardLinkPath = join(sandbox, "hard-link.jsonl");
linkSync(target, hardLinkPath);
assert.throws(
  () => readOutcomeLearningAdoptionDecisionJsonl(hardLinkPath),
  /must not be a hard link/,
);
assert.throws(
  () => appendOutcomeLearningAdoptionDecisionRecords({
    path: hardLinkPath,
    incoming: [{} as OutcomeLearningAdoptionDecisionRecord],
    schema: {} as JsonSchema,
    context: {} as OutcomeLearningAdoptionDecisionContext,
  }),
  /must not be a hard link/,
);

console.log("outcome-learning-adoption-decision-local-path.test.ts passed");
