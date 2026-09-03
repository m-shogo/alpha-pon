import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { linkSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "research-backtest-linked-bundle-"));
try {
  const target = join(dir, "bundle-target.json");
  writeFileSync(target, "{}\n", "utf-8");

  for (const [kind, createLinkedBundle] of [
    ["symlink", (path: string) => symlinkSync(target, path, "file")],
    ["hardlink", (path: string) => linkSync(target, path)],
  ] as const) {
    const bundlePath = join(dir, `${kind}.json`);
    createLinkedBundle(bundlePath);
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx/esm", "src/research/cli/backtest.ts", `--bundle=${bundlePath}`],
      { encoding: "utf-8" },
    );

    assert.notEqual(result.status, 0, `${kind} backtest bundle must fail closed`);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /backtest bundle must be a standalone regular file/,
      `${kind} backtest bundle must be rejected before parsing or execution`,
    );
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("backtest-linked-bundle.test.ts passed");
