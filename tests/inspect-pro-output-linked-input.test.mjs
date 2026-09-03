import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(repoRoot, "scripts", "inspect-pro-output.mjs");

function prepareRoot() {
  const root = mkdtempSync(join(tmpdir(), "inspect-pro-output-linked-"));
  mkdirSync(join(root, "reports"), { recursive: true });
  mkdirSync(join(root, "apps", "web", "public", "generated"), { recursive: true });
  writeFileSync(
    join(root, "apps", "web", "public", "generated", "alpha-pon-data.json"),
    JSON.stringify({ legendProCommittee: { decisions: [] } }),
  );
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf-8" });
}

for (const kind of ["symlink", "hardlink"]) {
  const root = prepareRoot();
  try {
    const target = join(root, "committee-target.json");
    writeFileSync(target, JSON.stringify({ decisions: [] }));
    const input = join(root, "reports", "stock_pro_committee_latest.json");
    if (kind === "symlink") symlinkSync(target, input, "file");
    else linkSync(target, input);

    const result = run(root);
    assert.equal(result.status, 1, `${kind} committee input must fail closed`);
    assert.match(result.stderr, /\[missing\] reports\/stock_pro_committee_latest\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const standaloneRoot = prepareRoot();
try {
  writeFileSync(
    join(standaloneRoot, "reports", "stock_pro_committee_latest.json"),
    JSON.stringify({ decisions: [] }),
  );
  const result = run(standaloneRoot);
  assert.equal(result.status, 0, `standalone inputs must remain readable: ${result.stderr}`);
} finally {
  rmSync(standaloneRoot, { recursive: true, force: true });
}

console.log("inspect-pro-output-linked-input.test.mjs passed");
