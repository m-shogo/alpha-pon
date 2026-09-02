import assert from "node:assert/strict";
import { mkdtempSync, linkSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const canonicalPath = resolve(root, "config/research/edinet-issuer-registry.v1.json");
const canonical = readFileSync(canonicalPath, "utf-8");
const tempRoot = mkdtempSync(join(tmpdir(), "alpha-pon-edinet-registry-hardlink-"));
const externalTarget = join(tempRoot, "issuer-registry.json");
const linkedPath = resolve(root, `config/research/.issuer-registry-hardlink-${process.pid}.json`);

try {
  writeFileSync(externalTarget, canonical, "utf-8");
  linkSync(externalTarget, linkedPath);
  const before = readFileSync(externalTarget, "utf-8");

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      "src/research/cli/audit-edinet-issuer-registry.ts",
      "--registry",
      relative(root, linkedPath),
    ],
    { cwd: root, encoding: "utf-8" },
  );

  assert.equal(result.status, 1, `expected hard-linked registry rejection, stdout=${result.stdout}`);
  assert.match(result.stderr, /standalone regular non-symlink file/);
  assert.equal(readFileSync(externalTarget, "utf-8"), before, "external hard-link target must remain unchanged");
  console.log("edinet-sanrio-real-pilot-issuer-registry-hardlink.test.ts passed");
} finally {
  rmSync(linkedPath, { force: true });
  rmSync(tempRoot, { recursive: true, force: true });
}
