import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve, join } from "node:path";

const root = process.cwd();
const localRoot = resolve(root, "data/edinet");
const tempRoot = mkdtempSync(join(tmpdir(), "alpha-pon-foundation-readiness-hardlink-"));
const acquisitionDirectory = resolve(localRoot, `sanrio-acquisition.hardlink-${process.pid}`);
const cli = "src/research/cli/audit-sanrio-configured-foundation-readiness.ts";

function run(parityPath: string) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      cli,
      "--parity-review",
      relative(root, parityPath),
      "--execute-readiness-audit",
    ],
    { cwd: root, encoding: "utf-8" },
  );
}

try {
  mkdirSync(acquisitionDirectory, { recursive: true });

  const externalParity = join(tempRoot, "legacy-configured-parity-review-record-v1.external.json");
  const linkedParity = resolve(acquisitionDirectory, "legacy-configured-parity-review-record-v1.hardlink.json");
  writeFileSync(externalParity, "{}\n", "utf-8");
  linkSync(externalParity, linkedParity);
  const parityBefore = readFileSync(externalParity, "utf-8");

  const parityResult = run(linkedParity);
  assert.equal(parityResult.status, 1, `expected hard-linked parity rejection, stdout=${parityResult.stdout}`);
  assert.match(parityResult.stderr, /parity review must be a single-link regular non-symlink file/);
  assert.equal(
    readFileSync(externalParity, "utf-8"),
    parityBefore,
    "external parity hard-link target must remain unchanged",
  );
  rmSync(linkedParity, { force: true });

  const externalWorkspace = join(tempRoot, "workspace.json");
  const linkedWorkspace = resolve(acquisitionDirectory, "workspace.json");
  writeFileSync(externalWorkspace, "{}\n", "utf-8");
  linkSync(externalWorkspace, linkedWorkspace);
  const workspaceBefore = readFileSync(externalWorkspace, "utf-8");

  const parityPath = resolve(acquisitionDirectory, "legacy-configured-parity-review-record-v1.workspace-hardlink.json");
  writeFileSync(parityPath, `${JSON.stringify({ sourceWorkspaceFile: "workspace.json" })}\n`, "utf-8");

  const workspaceResult = run(parityPath);
  assert.equal(workspaceResult.status, 1, `expected hard-linked workspace rejection, stdout=${workspaceResult.stdout}`);
  assert.match(workspaceResult.stderr, /source parity workspace must be a single-link regular non-symlink file/);
  assert.equal(
    readFileSync(externalWorkspace, "utf-8"),
    workspaceBefore,
    "external workspace hard-link target must remain unchanged",
  );

  console.log("edinet-sanrio-real-pilot-foundation-readiness-hardlink: hard-linked parity and workspace inputs are rejected OK");
} finally {
  rmSync(acquisitionDirectory, { recursive: true, force: true });
  rmSync(tempRoot, { recursive: true, force: true });
}
