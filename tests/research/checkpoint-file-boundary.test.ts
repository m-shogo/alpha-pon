import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCheckpoint, ResearchDataError } from "../../src/research/io.js";

const originalCwd = process.cwd();
const schema = readFileSync(join(originalCwd, "research/schemas/checkpoint.schema.json"), "utf-8");
const checkpoint = readFileSync(join(originalCwd, "research/checkpoint/latest.json"), "utf-8");
const root = mkdtempSync(join(tmpdir(), "alpha-pon-research-checkpoint-"));
const schemaDir = join(root, "research/schemas");
const checkpointDir = join(root, "research/checkpoint");
const latest = join(checkpointDir, "latest.json");
const target = join(checkpointDir, "target.json");

mkdirSync(schemaDir, { recursive: true });
mkdirSync(checkpointDir, { recursive: true });
writeFileSync(join(schemaDir, "checkpoint.schema.json"), schema, "utf-8");
writeFileSync(target, checkpoint, "utf-8");

try {
  process.chdir(root);

  writeFileSync(latest, checkpoint, "utf-8");
  assert.equal(loadCheckpoint()?.schemaVersion, 1, "standalone checkpointは読み込める");

  unlinkSync(latest);
  symlinkSync(target, latest);
  assert.throws(
    () => loadCheckpoint(),
    (error: unknown) => error instanceof ResearchDataError && /standalone regular JSON file/.test(error.message),
    "symlink checkpointをcanonical Evidenceとして追従しない",
  );

  unlinkSync(latest);
  linkSync(target, latest);
  assert.throws(
    () => loadCheckpoint(),
    (error: unknown) => error instanceof ResearchDataError && /standalone regular JSON file/.test(error.message),
    "hard-link checkpointをcanonical Evidenceとして追従しない",
  );
} finally {
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
}

console.log("research/checkpoint-file-boundary: linked Evidence rejection OK");
