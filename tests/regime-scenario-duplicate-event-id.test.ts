import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegimeScenarioReflectionState } from "../src/regime-scenario-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-regime-duplicate-id-"));
try {
  const path = join(dir, "world_event_reflections_latest.json");
  writeFileSync(path, JSON.stringify([
    {
      schemaVersion: 1,
      createdAt: "2026-08-20",
      eventId: "2026-08-20-rate-shock",
      title: "政策金利と銀行信用の変化",
      categories: ["金融不安", "金利"],
      impactedTags: ["銀行", "信用"],
    },
    {
      schemaVersion: 1,
      createdAt: "2026-08-20",
      eventId: "2026-08-20-rate-shock",
      title: "同じイベントの重複行",
      categories: ["金融不安"],
      impactedTags: ["銀行"],
    },
    {
      schemaVersion: 1,
      createdAt: "2026-08-20",
      eventId: "2026-08-20-geopolitics",
      title: "地政学リスクの変化",
      categories: ["地政学"],
      impactedTags: ["防衛"],
    },
  ]), "utf-8");

  const loaded = loadRegimeScenarioReflectionState(path, "2026-08-20");
  assert.equal(loaded.rows.length, 1, "all rows sharing a duplicate canonical eventId must be isolated");
  assert.equal(loaded.rows[0]?.eventId, "2026-08-20-geopolitics");
  assert.match(loaded.warnings.join("\n"), /1 duplicate eventId\(s\) isolated at row\(s\) 1, 2/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("regime-scenario duplicate event id: duplicate canonical reflections are isolated before scoring");
