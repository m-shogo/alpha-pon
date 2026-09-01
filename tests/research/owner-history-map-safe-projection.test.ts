import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isOwnerResearchHistoryMapTemporalSafe } from "../../apps/web/lib/research-history-map-temporal.js";
import { buildOwnerResearchHistoryMap } from "../../src/research/owner-history-map.js";
import type { Counterfactual, HistoricalAnalog, ResearchState } from "../../src/research/types.js";

const analog: HistoricalAnalog = {
  schemaVersion: 1,
  id: "analog-owner-safe-001",
  eventType: "governance_event",
  companyCode: "1234",
  companyName: "Example Corp",
  eventDate: "2026-08-01",
  observedAt: "2026-08-01T09:15:00+09:00",
  source: "https://example.invalid/private-source.pdf",
  sourceType: "company_ir",
  summary: "Publicly knowable summary at the recorded PIT timestamp.",
  recordedAt: "2026-08-01T10:00:00+09:00",
  edgeIds: ["edge-b", "edge-a"],
  marketReaction: {
    measuredAt: "2026-08-21T15:00:00+09:00",
    horizonDays: 20,
    rawReturnBps: 321,
    benchmarkReturnBps: 100,
    excessReturnBps: 221,
    benchmark: "TOPIX",
    priceSource: "licensed://private-price-source",
  },
  outcome: {
    measuredAt: "2026-08-21T15:00:00+09:00",
    verdict: "repriced_up",
    roiBps: 250,
    notes: "Internal outcome note that must not be projected.",
  },
  keyEvents: [
    {
      date: "2026-08-05",
      label: "Follow-up disclosure",
      source: "https://example.invalid/private-key-event-source.pdf",
    },
  ],
  dataGaps: ["missing long-horizon observation"],
};

const linkedCounterfactual: Counterfactual = {
  schemaVersion: 1,
  id: "cf-owner-safe-001",
  analogId: analog.id,
  method: "market_index",
  comparator: "TOPIX",
  observedAt: "2026-08-21T15:00:00+09:00",
  recordedAt: "2026-08-21T16:00:00+09:00",
  eventReturnBps: 321,
  counterfactualReturnBps: 100,
  differenceBps: 221,
  explanation: "Internal comparison explanation.",
  dataGaps: ["internal comparison gap"],
};

const unrelatedCounterfactual: Counterfactual = {
  schemaVersion: 1,
  id: "cf-unrelated",
  analogId: "another-analog",
  method: "sector_index",
  comparator: "Sector Index",
  observedAt: "2026-08-21T15:00:00+09:00",
  recordedAt: "2026-08-21T16:00:00+09:00",
  differenceBps: -50,
};

const researchState: ResearchState = {
  edges: [],
  analogs: [analog],
  counterfactuals: [unrelatedCounterfactual, linkedCounterfactual],
  confounders: [],
  checkpoint: null,
};

const snapshot = {
  researchItems: [],
  researchFamilies: [],
  relations: [],
  cases: [],
  researchComponents: [],
  lineages: [],
  studies: [],
  studyResults: [],
} as unknown as Parameters<typeof buildOwnerResearchHistoryMap>[0]["snapshot"];

const result = buildOwnerResearchHistoryMap({
  snapshot,
  researchState,
  generatedAt: "2026-08-29T06:45:00Z",
});

assert.equal(result.counts.historicalAnalogs, 1);
assert.equal(result.counts.resolvedOutcomes, 1);
assert.equal(result.counts.unresolvedOutcomes, 0);
assert.equal(result.historicalAnalogs.length, 1);

const projected = result.historicalAnalogs[0];
assert.deepEqual(projected, {
  id: "analog-owner-safe-001",
  eventType: "governance_event",
  companyCode: "1234",
  companyName: "Example Corp",
  eventDate: "2026-08-01",
  observedAt: "2026-08-01T09:15:00+09:00",
  sourceType: "company_ir",
  summary: "Publicly knowable summary at the recorded PIT timestamp.",
  edgeIds: ["edge-a", "edge-b"],
  marketReaction: {
    measuredAt: "2026-08-21T15:00:00+09:00",
    horizonDays: 20,
    rawReturnBps: 321,
    benchmarkReturnBps: 100,
    excessReturnBps: 221,
    benchmark: "TOPIX",
  },
  outcome: {
    verdict: "repriced_up",
    measuredAt: "2026-08-21T15:00:00+09:00",
    roiBps: 250,
  },
  keyEvents: [{ date: "2026-08-05", label: "Follow-up disclosure" }],
  counterfactuals: [{
    id: "cf-owner-safe-001",
    method: "market_index",
    comparator: "TOPIX",
    differenceBps: 221,
  }],
  dataGaps: ["missing long-horizon observation"],
});

assert.equal("source" in projected, false, "raw source URL must stay out of Owner projection");
assert.equal("priceSource" in (projected.marketReaction ?? {}), false, "licensed priceSource must stay out of Owner projection");
assert.equal("notes" in (projected.outcome ?? {}), false, "internal outcome notes must stay out of Owner projection");
assert.equal("observedAt" in projected.counterfactuals[0], false, "Counterfactual PIT internals must not leak into Owner projection");
assert.equal("explanation" in projected.counterfactuals[0], false, "Counterfactual internal explanation must not leak into Owner projection");

const temporalNow = Date.parse("2026-08-29T06:45:00Z");
assert.equal(
  isOwnerResearchHistoryMapTemporalSafe(result, temporalNow),
  true,
  "canonical historical analog timestamps at or before generation must be accepted",
);

for (const contradictory of [
  {
    ...result,
    historicalAnalogs: [{ ...projected, observedAt: "2026-08-29T06:45:00.001Z" }],
  },
  {
    ...result,
    historicalAnalogs: [{ ...projected, observedAt: "not-a-timestamp" }],
  },
  {
    ...result,
    historicalAnalogs: [{
      ...projected,
      marketReaction: projected.marketReaction && {
        ...projected.marketReaction,
        measuredAt: "2026-08-29T06:45:00.001Z",
      },
    }],
  },
  {
    ...result,
    historicalAnalogs: [{
      ...projected,
      outcome: projected.outcome && {
        ...projected.outcome,
        measuredAt: "2026-08-29",
      },
    }],
  },
]) {
  assert.equal(
    isOwnerResearchHistoryMapTemporalSafe(contradictory, temporalNow),
    false,
    "malformed or post-generation historical analog timestamps must fail closed",
  );
}

const originalCwd = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "alpha-pon-owner-history-map-"));
const generatedDir = join(tempRoot, "public", "generated");
mkdirSync(generatedDir, { recursive: true });

try {
  process.chdir(tempRoot);
  const { loadOwnerResearchHistoryMap } = await import("../../apps/web/lib/research-history-map.js");
  const historyMapPath = join(generatedDir, "research-history-map.json");

  writeFileSync(historyMapPath, JSON.stringify(result), "utf-8");
  assert.equal(loadOwnerResearchHistoryMap().warning, null, "a count-consistent generated snapshot must be accepted");

  const inconsistentCounts = [
    ["families", { families: result.counts.families + 1 }],
    ["historicalAnalogs", {
      historicalAnalogs: result.counts.historicalAnalogs + 1,
      resolvedOutcomes: result.counts.resolvedOutcomes + 1,
    }],
    ["cases", { cases: result.counts.cases + 1 }],
    ["researchComponents", { researchComponents: result.counts.researchComponents + 1 }],
    ["lineages", { lineages: result.counts.lineages + 1 }],
  ] as const;

  for (const [label, countPatch] of inconsistentCounts) {
    writeFileSync(historyMapPath, JSON.stringify({
      ...result,
      counts: { ...result.counts, ...countPatch },
    }), "utf-8");
    assert.notEqual(
      loadOwnerResearchHistoryMap().warning,
      null,
      `${label} count mismatch must fail closed instead of exposing a contradictory Owner snapshot`,
    );
  }

  writeFileSync(historyMapPath, JSON.stringify({
    ...result,
    counts: {
      ...result.counts,
      resolvedOutcomes: 0,
      unresolvedOutcomes: result.counts.historicalAnalogs,
    },
  }), "utf-8");
  assert.notEqual(
    loadOwnerResearchHistoryMap().warning,
    null,
    "resolved/unresolved outcome counts must match the projected analog verdicts",
  );
} finally {
  process.chdir(originalCwd);
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("research/owner history map: canonical analog safe projection, temporal consistency and count consistency OK");
