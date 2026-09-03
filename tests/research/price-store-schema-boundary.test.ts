import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { linkSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "price-store-schema-boundary-"));
try {
  const target = join(dir, "schema-target.json");
  writeFileSync(target, "{}\n", "utf-8");

  for (const [kind, createLinkedSchema] of [
    ["symlink", (path: string) => symlinkSync(target, path, "file")],
    ["hardlink", (path: string) => linkSync(target, path)],
  ] as const) {
    const schemaPath = join(dir, `${kind}.json`);
    createLinkedSchema(schemaPath);
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx/esm",
        "src/research/cli/validate-prices.ts",
        `--root=${join(dir, "missing-price-root")}`,
        `--schema=${schemaPath}`,
      ],
      { encoding: "utf-8" },
    );

    assert.notEqual(result.status, 0, `${kind} schema input must fail closed`);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /price_store_schema_must_be_standalone_regular_file/,
      `${kind} schema input must be rejected before PIT validation`,
    );
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("price-store-schema-boundary.test.ts passed");
