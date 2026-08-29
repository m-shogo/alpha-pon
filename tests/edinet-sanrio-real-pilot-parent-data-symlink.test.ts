import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const cliPath = resolve(repoRoot, "src/research/cli/check-sanrio-real-pilot-preflight.ts");
const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-parent-data-symlink-"));
const outsideData = join(base, "outside-data");
mkdirSync(join(outsideData, "edinet"), { recursive: true });
symlinkSync(outsideData, join(base, "data"), "dir");

const result = spawnSync(
  process.execPath,
  ["--import", "tsx/esm", cliPath],
  { cwd: base, encoding: "utf-8" },
);

assert.equal(result.status, 1, "canonical Sanrio preflight must fail closed when data is a symlink");
assert.match(
  result.stderr,
  /data\/edinet parent data directory must not be a symlink/,
  "canonical Sanrio preflight must report the local-root ancestry violation",
);

console.log("edinet-sanrio-real-pilot-parent-data-symlink: parent data symlink is rejected OK");
