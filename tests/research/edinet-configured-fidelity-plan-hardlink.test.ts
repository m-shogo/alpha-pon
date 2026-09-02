import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  linkSync,
  mkdirSync,
  readFileSync,
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

const anchorToken = `${process.pid}_${Date.now()}_anchor`;
const anchorDirectory = resolve(root, `testissuer-acquisition.${anchorToken}`);
const anchorSourcePath = resolve(anchorDirectory, "anchor-source.json");
const anchorHardlinkPath = resolve(anchorDirectory, `configured-fidelity-anchor-input-v1.${anchorToken}.json`);

mkdirSync(anchorDirectory, { recursive: true });

try {
  writeFileSync(anchorSourcePath, "{}\n", "utf-8");
  linkSync(anchorSourcePath, anchorHardlinkPath);
  const original = readFileSync(anchorSourcePath, "utf-8");

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      "src/research/cli/finalize-configured-edinet-anchor-input.ts",
      "--anchor-input",
      `data/edinet/${basename(anchorDirectory)}/${basename(anchorHardlinkPath)}`,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: { ...process.env },
    },
  );

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /anchor input must be a standalone regular non-symlink file/);
  assert.equal(
    readdirSync(anchorDirectory).some((name) => name.startsWith("configured-fidelity-anchor-final-v1.")),
    false,
    "hard-linked anchor input must be rejected before any final review output is created",
  );
  assert.equal(
    readFileSync(anchorSourcePath, "utf-8"),
    original,
    "rejecting a hard-linked anchor input must not mutate its external link target",
  );

  console.log("configured-edinet-anchor-finalizer-hardlink.test.ts passed");
} finally {
  rmSync(anchorDirectory, { recursive: true, force: true });
}
