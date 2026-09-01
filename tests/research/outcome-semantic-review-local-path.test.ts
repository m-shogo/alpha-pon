import assert from "node:assert/strict";
import { linkSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendOutcomeSemanticReviewRecords,
  readOutcomeSemanticReviewJsonl,
  type OutcomeSemanticReviewContext,
  type OutcomeSemanticReviewRecord,
} from "../../src/research/outcome-semantic-review.js";
import type { JsonSchema } from "../../src/research/schema.js";

const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-outcome-semantic-review-path-"));
const external = join(sandbox, "external.jsonl");
writeFileSync(external, "sentinel\n", "utf-8");

const symlinkPath = join(sandbox, "symlink.jsonl");
symlinkSync(external, symlinkPath);
assert.throws(
  () => readOutcomeSemanticReviewJsonl(symlinkPath),
  /must not be a symbolic link/,
);

const hardlinkPath = join(sandbox, "hardlink.jsonl");
linkSync(external, hardlinkPath);
assert.throws(
  () => readOutcomeSemanticReviewJsonl(hardlinkPath),
  /must not be a hard link/,
);

const dummyRecord = {} as OutcomeSemanticReviewRecord;
const dummySchema = {} as JsonSchema;
const dummyContext: OutcomeSemanticReviewContext = {
  recommendationsById: new Map(),
  quantitativeOutcomesById: new Map(),
  evidenceByRef: new Map(),
  reviewersByRef: new Map(),
};

assert.throws(
  () => appendOutcomeSemanticReviewRecords({
    path: symlinkPath,
    incoming: [dummyRecord],
    schema: dummySchema,
    context: dummyContext,
  }),
  /must not be a symbolic link/,
);
assert.throws(
  () => appendOutcomeSemanticReviewRecords({
    path: hardlinkPath,
    incoming: [dummyRecord],
    schema: dummySchema,
    context: dummyContext,
  }),
  /must not be a hard link/,
);

console.log("outcome-semantic-review-local-path.test.ts passed");
