import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegimeScenarioReflectionState } from "../src/regime-scenario-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-regime-empty-row-"));
try {
  const path = join(dir, "world_event_reflections_latest.json");
  writeFileSync(path, JSON.stringify([
    {},
    { title: "legacy signal", tags: ["災害"] },
    {
      eventId: "2026-08-20-canonical-signal",
      createdAt: "2026-08-20",
      title: "canonical signal",
      categories: ["金融不安"],
      impactedTags: ["銀行"],
    },
  ]), "utf-8");

  const state = loadRegimeScenarioReflectionState(path, "2026-08-20");
  assert.deepEqual(
    state.rows.map(row => row.title),
    ["legacy signal", "canonical signal"],
    "empty object rows must not be silently accepted as usable regime evidence",
  );
  assert.equal(state.warnings.length, 1);
  assert.match(state.warnings[0] ?? "", /1 malformed reflection row\(s\).*row\(s\) 1/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("regime-scenario empty reflection: empty rows are isolated while useful legacy/canonical evidence remains usable");
