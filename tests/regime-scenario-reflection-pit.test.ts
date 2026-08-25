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
      eventId: "2026-08-20-current",
      createdAt: "2026-08-20",
      title: "current",
      categories: ["金融不安"],
      impactedTags: ["銀行"],
    },
    {
      eventId: "2026-08-21-future",
      createdAt: "2026-08-21",
      title: "future",
      categories: ["金利"],
      impactedTags: ["信用"],
    },
    {
      eventId: "2026-02-31-invalid-date",
      createdAt: "2026-02-31",
      title: "invalid-date",
      categories: ["金融不安"],
      impactedTags: ["銀行"],
    },
    {
      date: "2026-08-20",
      title: "legacy-current",
      category: "金融不安",
      tags: ["銀行"],
    },
    {
      date: "2026-08-21",
      title: "legacy-future",
      category: "金利",
      tags: ["信用"],
    },
    {
      date: "2026-02-31",
      title: "legacy-invalid-date",
      category: "金融不安",
      tags: ["銀行"],
    },
    {
      title: "legacy-undated",
      category: "金融不安",
      tags: ["銀行"],
    },
  ]), "utf-8");

  const state = loadRegimeScenarioReflectionState(path, "2026-08-20");
  assert.deepEqual(
    state.rows.map(row => row.title),
    ["current", "legacy-current"],
    "future, impossible, or undated canonical or legacy reflections must not influence current regime scoring",
  );
  assert.equal(state.warnings.length, 1);
  assert.match(state.warnings[0] ?? "", /5 malformed reflection row\(s\).*row\(s\) 2, 3, 5, 6, 7/);
  assert.ok(!state.warnings[0]?.includes("future"), "metadata warning must not expose raw reflection content");

  assert.throws(
    () => loadRegimeScenarioReflectionState(path, "2026-02-31"),
    /as-of date must be a real Gregorian date/,
    "invalid as-of dates must not weaken regime PIT filtering",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("regime-scenario reflection PIT: future, impossible, and undated provenance is isolated");
