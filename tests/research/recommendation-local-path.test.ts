import assert from "node:assert/strict";
import { linkSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRecommendationRecords,
  readRecommendationJsonl,
  type RecommendationRecord,
  type RecommendationValidationContext,
} from "../../src/research/recommendation-persistence.js";
import type { JsonSchema } from "../../src/research/schema.js";

const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-recommendation-path-"));
const external = join(sandbox, "external.jsonl");
writeFileSync(external, "sentinel\n", "utf-8");

const symlinkPath = join(sandbox, "symlink.jsonl");
symlinkSync(external, symlinkPath);
assert.throws(
  () => readRecommendationJsonl(symlinkPath),
  /must not be a symbolic link/,
);

const hardlinkPath = join(sandbox, "hardlink.jsonl");
linkSync(external, hardlinkPath);
assert.throws(
  () => readRecommendationJsonl(hardlinkPath),
  /must not be a hard link/,
);

const dummyRecord = {} as RecommendationRecord;
const dummySchema = {} as JsonSchema;
const dummyContext: RecommendationValidationContext = {
  priceRecordsByHash: new Map(),
  evidenceByRef: new Map(),
  edgeStageById: new Map(),
};

assert.throws(
  () => appendRecommendationRecords({
    path: symlinkPath,
    incoming: [dummyRecord],
    schema: dummySchema,
    context: dummyContext,
  }),
  /must not be a symbolic link/,
);
assert.throws(
  () => appendRecommendationRecords({
    path: hardlinkPath,
    incoming: [dummyRecord],
    schema: dummySchema,
    context: dummyContext,
  }),
  /must not be a hard link/,
);

console.log("recommendation-local-path.test.ts passed");
