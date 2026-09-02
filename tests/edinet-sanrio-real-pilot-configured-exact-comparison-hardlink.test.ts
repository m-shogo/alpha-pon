import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const localRoot = resolve(root, "data/edinet");
const tempRoot = mkdtempSync(join(tmpdir(), "alpha-pon-exact-comparison-hardlink-"));
const externalTarget = join(tempRoot, "configured-fidelity-anchor-final-v1.synthetic.json");
const acquisitionDirectory = resolve(localRoot, `synthetic-co-acquisition.hardlink-${process.pid}`);
const linkedAnchor = resolve(acquisitionDirectory, "configured-fidelity-anchor-final-v1.synthetic.json");

try {
  mkdirSync(acquisitionDirectory, { recursive: true });
  writeFileSync(externalTarget, "{}\n", "utf-8");
  linkSync(externalTarget, linkedAnchor);
  const before = readFileSync(externalTarget, "utf-8");

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      "src/research/cli/compare-configured-edinet-anchors-exact.ts",
      "--execute-exact-comparison",
      "--anchor-final",
      relative(root, linkedAnchor),
    ],
    { cwd: root, encoding: "utf-8" },
  );

  assert.equal(result.status, 1, `expected hard-linked anchor rejection, stdout=${result.stdout}`);
  assert.match(result.stderr, /anchor final must be a standalone regular non-symlink file/);
  assert.equal(readFileSync(externalTarget, "utf-8"), before, "external hard-link target must remain unchanged");
  console.log("edinet-sanrio-real-pilot-configured-exact-comparison-hardlink: hard-linked anchor is rejected OK");
} finally {
  rmSync(acquisitionDirectory, { recursive: true, force: true });
  rmSync(tempRoot, { recursive: true, force: true });
}
