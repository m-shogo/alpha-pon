import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const localRoot = resolve(root, "data/edinet");
const tempRoot = mkdtempSync(join(tmpdir(), "alpha-pon-configured-acquisition-hardlink-"));
const externalTarget = join(tempRoot, "review-plan.json");
const linkedPath = resolve(localRoot, `.configured-acquisition-hardlink-${process.pid}.json`);

try {
  mkdirSync(localRoot, { recursive: true });
  writeFileSync(externalTarget, "{}\n", "utf-8");
  linkSync(externalTarget, linkedPath);
  const before = readFileSync(externalTarget, "utf-8");

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      "src/run-configured-edinet-acquisition.ts",
      "--review-plan",
      relative(root, linkedPath),
    ],
    {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, EDINET_API_KEY: "" },
    },
  );

  assert.equal(result.status, 1, `expected hard-linked review-plan rejection, stdout=${result.stdout}`);
  assert.match(result.stderr, /review plan must be a standalone regular non-symlink file/);
  assert.doesNotMatch(result.stderr, /credentials_missing/);
  assert.doesNotMatch(result.stderr, /explicit --execute-local-acquisition flag/);
  assert.equal(readFileSync(externalTarget, "utf-8"), before, "external hard-link target must remain unchanged");
  console.log("edinet-sanrio-real-pilot-configured-acquisition-hardlink: hard links are rejected OK");
} finally {
  rmSync(linkedPath, { force: true });
  rmSync(tempRoot, { recursive: true, force: true });
}
