import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const localRoot = resolve(root, "data/edinet");
const tempRoot = mkdtempSync(join(tmpdir(), "alpha-pon-inventory-compat-hardlink-"));
const externalTarget = join(tempRoot, "legacy-inventory.json");
const linkedInventory = resolve(localRoot, `synthetic-inventory-hardlink-${process.pid}.json`);

try {
  mkdirSync(localRoot, { recursive: true });
  writeFileSync(externalTarget, "{}\n", "utf-8");
  linkSync(externalTarget, linkedInventory);
  const before = readFileSync(externalTarget, "utf-8");

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      "src/research/cli/audit-edinet-inventory-compatibility.ts",
      "--legacy",
      relative(root, linkedInventory),
      "--configured",
      relative(root, linkedInventory),
    ],
    { cwd: root, encoding: "utf-8" },
  );

  assert.equal(result.status, 1, `expected hard-linked inventory rejection, stdout=${result.stdout}`);
  assert.match(result.stderr, /legacy inventory must be a standalone regular non-symlink file/);
  assert.equal(readFileSync(externalTarget, "utf-8"), before, "external hard-link target must remain unchanged");
  console.log("edinet-sanrio-real-pilot-inventory-compatibility-hardlink: hard-linked inventory is rejected OK");
} finally {
  rmSync(linkedInventory, { force: true });
  rmSync(tempRoot, { recursive: true, force: true });
}
