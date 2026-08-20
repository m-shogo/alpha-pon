import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";

import { inspectJsonArtifact } from "../src/health/json-artifact-health.js";

test("accepts a regular non-empty JSON object artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-health-json-"));
  try {
    const path = join(dir, "artifact.json");
    writeFileSync(path, JSON.stringify({ ok: true }), "utf-8");
    assert.deepEqual(inspectJsonArtifact(path), { ok: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails closed for unusable generated JSON artifacts", () => {
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-health-json-"));
  try {
    const directoryPath = join(dir, "directory.json");
    mkdirSync(directoryPath);
    assert.deepEqual(inspectJsonArtifact(directoryPath), { ok: false, reason: "not_file" });

    const blankPath = join(dir, "blank.json");
    writeFileSync(blankPath, "   \n", "utf-8");
    assert.deepEqual(inspectJsonArtifact(blankPath), { ok: false, reason: "empty" });

    for (const [name, value] of [
      ["null.json", "null"],
      ["string.json", '"broken"'],
      ["array.json", "[]"],
    ] as const) {
      const path = join(dir, name);
      writeFileSync(path, value, "utf-8");
      assert.deepEqual(inspectJsonArtifact(path), { ok: false, reason: "invalid_root" });
    }

    const malformedPath = join(dir, "malformed.json");
    writeFileSync(malformedPath, "{", "utf-8");
    assert.deepEqual(inspectJsonArtifact(malformedPath), { ok: false, reason: "invalid_json" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
