import assert from "node:assert/strict";
import { linkSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendOutcomeLearningChangePreparationRecords,
  readOutcomeLearningChangePreparationJsonl,
  type OutcomeLearningChangePreparationContext,
  type OutcomeLearningChangePreparationRecord,
} from "../../src/research/outcome-learning-change-preparation.js";
import type { JsonSchema } from "../../src/research/schema.js";

const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-change-preparation-local-path-"));
const target = join(sandbox, "target.jsonl");
writeFileSync(target, "", "utf-8");

const symlinkPath = join(sandbox, "symlink.jsonl");
symlinkSync(target, symlinkPath);
assert.throws(
  () => readOutcomeLearningChangePreparationJsonl(symlinkPath),
  /must not be a symbolic link/,
);
assert.throws(
  () => appendOutcomeLearningChangePreparationRecords({
    path: symlinkPath,
    incoming: [{} as OutcomeLearningChangePreparationRecord],
    schema: {} as JsonSchema,
    context: {} as OutcomeLearningChangePreparationContext,
  }),
  /must not be a symbolic link/,
);

const hardLinkPath = join(sandbox, "hard-link.jsonl");
linkSync(target, hardLinkPath);
assert.throws(
  () => readOutcomeLearningChangePreparationJsonl(hardLinkPath),
  /must not be a hard link/,
);
assert.throws(
  () => appendOutcomeLearningChangePreparationRecords({
    path: hardLinkPath,
    incoming: [{} as OutcomeLearningChangePreparationRecord],
    schema: {} as JsonSchema,
    context: {} as OutcomeLearningChangePreparationContext,
  }),
  /must not be a hard link/,
);

console.log("outcome-learning-change-preparation-local-path.test.ts passed");
