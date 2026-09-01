import assert from "node:assert/strict";
import { linkSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendOutcomeLearningShadowEvaluationRecords,
  readOutcomeLearningShadowEvaluationJsonl,
  type OutcomeLearningShadowEvaluationContext,
  type OutcomeLearningShadowEvaluationRecord,
} from "../../src/research/outcome-learning-shadow-evaluation.js";
import type { JsonSchema } from "../../src/research/schema.js";

const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-shadow-evaluation-local-path-"));
const target = join(sandbox, "target.jsonl");
writeFileSync(target, "", "utf-8");

const symlinkPath = join(sandbox, "symlink.jsonl");
symlinkSync(target, symlinkPath);
assert.throws(
  () => readOutcomeLearningShadowEvaluationJsonl(symlinkPath),
  /must not be a symbolic link/,
);
assert.throws(
  () => appendOutcomeLearningShadowEvaluationRecords({
    path: symlinkPath,
    incoming: [{} as OutcomeLearningShadowEvaluationRecord],
    schema: {} as JsonSchema,
    context: {} as OutcomeLearningShadowEvaluationContext,
  }),
  /must not be a symbolic link/,
);

const hardLinkPath = join(sandbox, "hard-link.jsonl");
linkSync(target, hardLinkPath);
assert.throws(
  () => readOutcomeLearningShadowEvaluationJsonl(hardLinkPath),
  /must not be a hard link/,
);
assert.throws(
  () => appendOutcomeLearningShadowEvaluationRecords({
    path: hardLinkPath,
    incoming: [{} as OutcomeLearningShadowEvaluationRecord],
    schema: {} as JsonSchema,
    context: {} as OutcomeLearningShadowEvaluationContext,
  }),
  /must not be a hard link/,
);

console.log("outcome-learning-shadow-evaluation-local-path.test.ts passed");
