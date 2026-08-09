import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectSanrioRealPilotPreflightWithIntegrity } from "../src/research/edinet-sanrio-real-pilot-integrity.js";

type JsonObject = Record<string, unknown>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function sandbox(): { root: string; acquisition: string } {
  const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-fidelity-integrity-"));
  const root = join(base, "data", "edinet");
  const acquisition = join(root, "sanrio-acquisition.20260806T064708Z");
  mkdirSync(acquisition, { recursive: true });
  return { root, acquisition };
}

function writeFidelity(acquisition: string, hashOverride?: string): void {
  const payload = {
    schemaVersion: 1,
    source: "edinet",
    sourceFocusedBundleHash: "a".repeat(64),
    sourceReviewWorkspaceHash: "b".repeat(64),
    fidelityPlanHash: "c".repeat(64),
    candidates: [],
    appendAuthorized: false,
  };
  writeFileSync(join(acquisition, "revision-source-fidelity-v1.20260806T090000Z.json"), `${JSON.stringify({
    ...payload,
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    reviewStatus: "pending_human_review",
    fidelityReportHash: hashOverride ?? digest(payload),
  }, null, 2)}\n`, "utf-8");
}

{
  const { root, acquisition } = sandbox();
  writeFidelity(acquisition, "d".repeat(64));
  assert.throws(
    () => inspectSanrioRealPilotPreflightWithIntegrity(root),
    /fidelity\.fidelityReportHash mismatch/,
  );
  console.log("edinet-sanrio-real-pilot-fidelity-integrity: invalid selected fidelity hash fails closed OK");
}

{
  const { root, acquisition } = sandbox();
  writeFidelity(acquisition);
  const result = inspectSanrioRealPilotPreflightWithIntegrity(root);
  assert.equal(result.stage, "inspection_required");
  assert.match(result.nextCommand ?? "", /run-sanrio-edinet-unmatched-anchor-inspection-local\.sh/);
  assert.equal(result.safety.foundationAppendAuthorized, false);
  assert.equal(result.safety.automaticTradingAuthorized, false);
  console.log("edinet-sanrio-real-pilot-fidelity-integrity: valid selected fidelity reaches read-only inspection advisory OK");
}

console.log("edinet-sanrio-real-pilot-fidelity-integrity.test.ts passed");
