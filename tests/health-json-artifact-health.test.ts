import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";

import { inspectJsonArtifact } from "../src/health/json-artifact-health.js";

test("accepts a regular non-empty JSON artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-health-json-"));
  try {
    const path = join(dir, "artifact.json");
    writeFileSync(path, JSON.stringify({ ok: true }), "utf-8");
    assert.deepEqual(inspectJsonArtifact(path), { ok: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails closed for directory, blank, null, and malformed JSON artifacts", () => {
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-health-json-"));
  try {
    const directoryPath = join(dir, "directory.json");
    mkdirSync(directoryPath);
    assert.deepEqual(inspectJsonArtifact(directoryPath), { ok: false, reason: "not_file" });

    const blankPath = join(dir, "blank.json");
    writeFileSync(blankPath, "   \n", "utf-8");
    assert.deepEqual(inspectJsonArtifact(blankPath), { ok: false, reason: "empty" });

    const nullPath = join(dir, "null.json");
    writeFileSync(nullPath, "null", "utf-8");
    assert.deepEqual(inspectJsonArtifact(nullPath), { ok: false, reason: "invalid_json" });

    const malformedPath = join(dir, "malformed.json");
    writeFileSync(malformedPath, "{", "utf-8");
    assert.deepEqual(inspectJsonArtifact(malformedPath), { ok: false, reason: "invalid_json" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
