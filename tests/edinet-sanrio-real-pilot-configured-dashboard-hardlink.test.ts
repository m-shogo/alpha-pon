import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const localRoot = resolve(root, "data/edinet");
const tempRoot = mkdtempSync(join(tmpdir(), "alpha-pon-configured-dashboard-hardlink-"));
const externalTarget = join(tempRoot, "configured-review-workspace-v2.json");
const acquisitionDirectory = resolve(localRoot, `synthetic-co-acquisition.hardlink-${process.pid}`);
const linkedWorkspace = resolve(acquisitionDirectory, "configured-review-workspace-v2.json");

try {
  mkdirSync(acquisitionDirectory, { recursive: true });
  writeFileSync(externalTarget, "{}\n", "utf-8");
  linkSync(externalTarget, linkedWorkspace);
  const before = readFileSync(externalTarget, "utf-8");

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      "src/research/cli/generate-configured-edinet-dashboard.ts",
      "--workspace",
      relative(root, linkedWorkspace),
    ],
    { cwd: root, encoding: "utf-8" },
  );

  assert.equal(result.status, 1, `expected hard-linked workspace rejection, stdout=${result.stdout}`);
  assert.match(result.stderr, /configured review workspace must be a standalone regular non-symlink file/);
  assert.equal(readFileSync(externalTarget, "utf-8"), before, "external hard-link target must remain unchanged");
  console.log("edinet-sanrio-real-pilot-configured-dashboard-hardlink: hard-linked workspace is rejected OK");
} finally {
  rmSync(acquisitionDirectory, { recursive: true, force: true });
  rmSync(tempRoot, { recursive: true, force: true });
}
