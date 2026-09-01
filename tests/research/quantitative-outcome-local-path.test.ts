import assert from "node:assert/strict";
import { linkSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendQuantitativeOutcomeRecords,
  readQuantitativeOutcomeJsonl,
  type QuantitativeOutcomeContext,
  type QuantitativeOutcomeRecord,
} from "../../src/research/quantitative-outcome.js";
import type { JsonSchema } from "../../src/research/schema.js";

const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-outcome-path-"));
const external = join(sandbox, "external.jsonl");
writeFileSync(external, "sentinel\n", "utf-8");

const symlinkPath = join(sandbox, "symlink.jsonl");
symlinkSync(external, symlinkPath);
assert.throws(
  () => readQuantitativeOutcomeJsonl(symlinkPath),
  /must not be a symbolic link/,
);

const hardlinkPath = join(sandbox, "hardlink.jsonl");
linkSync(external, hardlinkPath);
assert.throws(
  () => readQuantitativeOutcomeJsonl(hardlinkPath),
  /must not be a hard link/,
);

const dummyRecord = {} as QuantitativeOutcomeRecord;
const dummySchema = {} as JsonSchema;
const dummyContext: QuantitativeOutcomeContext = {
  recommendationsById: new Map(),
  priceRecordsByHash: new Map(),
  corporateActionClearancesByHash: new Map(),
};

assert.throws(
  () => appendQuantitativeOutcomeRecords({
    path: symlinkPath,
    incoming: [dummyRecord],
    schema: dummySchema,
    context: dummyContext,
  }),
  /must not be a symbolic link/,
);
assert.throws(
  () => appendQuantitativeOutcomeRecords({
    path: hardlinkPath,
    incoming: [dummyRecord],
    schema: dummySchema,
    context: dummyContext,
  }),
  /must not be a hard link/,
);

console.log("quantitative-outcome-local-path.test.ts passed");
