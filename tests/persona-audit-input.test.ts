import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isUsablePersonaAuditReport } from "../src/persona-audit-input.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-persona-audit-"));
try {
  const missing = join(root, "missing.md");
  const empty = join(root, "empty.md");
  const populated = join(root, "populated.md");
  const directory = join(root, "directory.md");

  writeFileSync(empty, "", "utf-8");
  writeFileSync(populated, "# report\n", "utf-8");
  mkdirSync(directory);

  assert.equal(isUsablePersonaAuditReport(missing), false);
  assert.equal(isUsablePersonaAuditReport(empty), false);
  assert.equal(isUsablePersonaAuditReport(directory), false);
  assert.equal(isUsablePersonaAuditReport(populated), true);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("persona audit input tests passed");
