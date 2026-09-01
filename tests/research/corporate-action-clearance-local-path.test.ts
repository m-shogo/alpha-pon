import assert from "node:assert/strict";
import { linkSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendCorporateActionClearanceRecords,
  readCorporateActionClearanceJsonl,
  type CorporateActionClearanceContext,
  type CorporateActionClearanceRecord,
} from "../../src/research/corporate-action-clearance.js";
import type { JsonSchema } from "../../src/research/schema.js";

const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-clearance-path-"));
const external = join(sandbox, "external.jsonl");
writeFileSync(external, "sentinel\n", "utf-8");

const symlinkPath = join(sandbox, "symlink.jsonl");
symlinkSync(external, symlinkPath);
assert.throws(
  () => readCorporateActionClearanceJsonl(symlinkPath),
  /must not be a symbolic link/,
);

const hardlinkPath = join(sandbox, "hardlink.jsonl");
linkSync(external, hardlinkPath);
assert.throws(
  () => readCorporateActionClearanceJsonl(hardlinkPath),
  /must not be a hard link/,
);

const dummyRecord = {} as CorporateActionClearanceRecord;
const dummySchema = {} as JsonSchema;
const dummyContext: CorporateActionClearanceContext = {
  evidenceByRef: new Map(),
};

assert.throws(
  () => appendCorporateActionClearanceRecords({
    path: symlinkPath,
    incoming: [dummyRecord],
    schema: dummySchema,
    context: dummyContext,
  }),
  /must not be a symbolic link/,
);
assert.throws(
  () => appendCorporateActionClearanceRecords({
    path: hardlinkPath,
    incoming: [dummyRecord],
    schema: dummySchema,
    context: dummyContext,
  }),
  /must not be a hard link/,
);

console.log("corporate-action-clearance-local-path.test.ts passed");
