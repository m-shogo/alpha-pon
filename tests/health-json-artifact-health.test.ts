import assert from "node:assert/strict";
import { linkSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
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

    const symlinkTarget = join(dir, "target.json");
    writeFileSync(symlinkTarget, JSON.stringify({ ok: true }), "utf-8");
    const symlinkPath = join(dir, "symlink.json");
    symlinkSync(symlinkTarget, symlinkPath);
    assert.deepEqual(
      inspectJsonArtifact(symlinkPath),
      { ok: false, reason: "not_file" },
      "a symlink must not satisfy generated JSON provenance at the canonical path",
    );

    const hardLinkPath = join(dir, "hard-link.json");
    linkSync(symlinkTarget, hardLinkPath);
    assert.deepEqual(
      inspectJsonArtifact(hardLinkPath),
      { ok: false, reason: "not_file" },
      "a hard link must not satisfy generated JSON provenance at the canonical path",
    );

    const blankPath = join(dir, "blank.json");
    writeFileSync(blankPath, "   \n", "utf-8");
    assert.deepEqual(inspectJsonArtifact(blankPath), { ok: false, reason: "empty" });

    for (const [name, value, reason] of [
      ["null.json", "null", "invalid_root"],
      ["string.json", '"broken"', "invalid_root"],
      ["array.json", "[]", "invalid_root"],
      ["empty-object.json", "{}", "empty_object"],
    ] as const) {
      const path = join(dir, name);
      writeFileSync(path, value, "utf-8");
      assert.deepEqual(inspectJsonArtifact(path), { ok: false, reason });
    }

    const malformedPath = join(dir, "malformed.json");
    writeFileSync(malformedPath, "{", "utf-8");
    assert.deepEqual(inspectJsonArtifact(malformedPath), { ok: false, reason: "invalid_json" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
