import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  linkSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

const root = resolve(process.cwd(), "data/edinet");
const token = `${process.pid}_${Date.now()}`;
const directory = resolve(root, `testissuer-acquisition.${token}`);
const sourcePath = resolve(directory, "workspace-source.json");
const hardlinkPath = resolve(directory, "configured-review-workspace-v2.json");

mkdirSync(directory, { recursive: true });

try {
  writeFileSync(sourcePath, "{}\n", "utf-8");
  linkSync(sourcePath, hardlinkPath);

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      "src/research/cli/prepare-configured-edinet-fidelity-plan.ts",
      "--workspace",
      `data/edinet/${basename(directory)}/configured-review-workspace-v2.json`,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: { ...process.env },
    },
  );

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /configured review workspace must be a standalone regular non-symlink file/);
  assert.equal(
    readdirSync(directory).some((name) => name.startsWith("configured-source-fidelity-plan-v1.")),
    false,
    "hard-linked workspace must be rejected before any fidelity-plan output is created",
  );

  console.log("edinet-configured-fidelity-plan-hardlink.test.ts passed");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
