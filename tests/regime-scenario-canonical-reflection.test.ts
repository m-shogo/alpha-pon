import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegimeScenarioReflections } from "../src/regime-scenario-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-regime-canonical-"));
try {
  const path = join(dir, "world_event_reflections_latest.json");
  writeFileSync(path, JSON.stringify([{
    schemaVersion: 1,
    createdAt: "2026-08-20",
    eventId: "2026-08-20-rate-shock",
    title: "政策金利と銀行信用の変化",
    categories: ["金融不安", "金利"],
    impactedTags: ["銀行", "信用"],
  }]), "utf-8");

  const [reflection] = loadRegimeScenarioReflections(path);
  assert.equal(reflection?.date, "2026-08-20", "canonical createdAt must remain available to the regime scenario consumer");
  assert.equal(reflection?.category, "金融不安 金利", "canonical categories must contribute to regime scenario scoring");
  assert.deepEqual(reflection?.tags, ["銀行", "信用"], "canonical impactedTags must contribute to regime scenario scoring");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("regime-scenario canonical reflection: canonical categories and impacted tags remain visible to scoring");
