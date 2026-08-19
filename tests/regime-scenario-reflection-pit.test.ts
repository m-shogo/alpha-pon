import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegimeScenarioReflectionState } from "../src/regime-scenario-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-regime-pit-"));
try {
  const path = join(dir, "world_event_reflections_latest.json");
  writeFileSync(path, JSON.stringify([
    {
      createdAt: "2026-08-20",
      title: "current",
      categories: ["金融不安"],
      impactedTags: ["銀行"],
    },
    {
      createdAt: "2026-08-21",
      title: "future",
      categories: ["金利"],
      impactedTags: ["信用"],
    },
    {
      createdAt: "2026-02-31",
      title: "invalid-date",
      categories: ["金融不安"],
      impactedTags: ["銀行"],
    },
  ]), "utf-8");

  const state = loadRegimeScenarioReflectionState(path, "2026-08-20");
  assert.deepEqual(state.rows.map(row => row.title), ["current"], "future and impossible canonical reflection dates must not influence current regime scoring");
  assert.equal(state.warnings.length, 1);
  assert.match(state.warnings[0] ?? "", /2 malformed reflection row\(s\).*row\(s\) 2, 3/);
  assert.ok(!state.warnings[0]?.includes("future"), "metadata warning must not expose raw reflection content");

  assert.throws(
    () => loadRegimeScenarioReflectionState(path, "2026-02-31"),
    /as-of date must be a real Gregorian date/,
    "invalid as-of dates must not weaken regime PIT filtering",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("regime-scenario reflection PIT: future and impossible canonical provenance is isolated");
