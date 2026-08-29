import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const cliPath = resolve(repoRoot, "src/research/cli/audit-sanrio-configured-foundation-readiness.ts");
const tsxLoader = import.meta.resolve("tsx/esm");
const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-foundation-parent-data-symlink-"));
const outsideData = join(base, "outside-data");
const acquisition = join(outsideData, "edinet", "sanrio-acquisition.synthetic");
mkdirSync(acquisition, { recursive: true });
symlinkSync(outsideData, join(base, "data"), "dir");

const result = spawnSync(
  process.execPath,
  [
    "--import",
    tsxLoader,
    cliPath,
    "--parity-review=data/edinet/sanrio-acquisition.synthetic/legacy-configured-parity-review-record-v1.synthetic.json",
    "--execute-readiness-audit",
  ],
  { cwd: base, encoding: "utf-8" },
);

assert.equal(result.status, 1, "Foundation readiness audit must fail closed when data is a symlink");
assert.match(
  result.stderr,
  /data\/edinet parent data directory must not be a symlink/,
  "Foundation readiness audit must enforce the canonical local-root boundary",
);

console.log("edinet-sanrio-real-pilot-foundation-readiness-parent-data-symlink: parent data symlink rejected OK");
