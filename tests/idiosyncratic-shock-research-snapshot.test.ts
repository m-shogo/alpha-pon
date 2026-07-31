import assert from "node:assert/strict";
import type { HistoricalShockCase } from "../src/idiosyncratic-shock.js";
import {
  assertShockResearchSnapshot,
  buildShockResearchSnapshot,
  shockResearchInputHash,
} from "../src/idiosyncratic-shock-research-snapshot-contract.js";

const base: HistoricalShockCase = {
  id: "sample-2019",
  company: "Sample Co",
  ticker: "9999",
  country: "JP",
  eventDate: "2019-01-01",
  decisionCheckpoint: "2019-01-02",
  category: "employee_sabotage",
  actorType: "employee",
  eventSummary: "sample event",
  macroPrimaryCause: false,
  evidenceStatus: "confirmed",
  priceStateAtCheckpoint: "volatile",
  scores: {
    businessImpactContainment: 1,
    accountingIntegrity: 2,
    actorSeparability: 2,
    organizationalContainment: 1,
    regulatoryContainment: 1,
    brandResilience: 1,
    managementContinuity: 2,
    fundamentalResilience: 1,
    discountMagnitude: 0,
    priceStabilization: 0,
  },
  score: 11,
  label: "caution",
  scoringNotes: {},
  sources: [
    { title: "B", url: "https://example.com/b", sourceType: "company", publishedAt: "2019-01-02" },
    { title: "A", url: "https://example.com/a", sourceType: "company", publishedAt: "2019-01-01" },
  ],
  researchConfidence: "medium",
  tags: ["beta", "alpha"],
};

const contexts = new Map();
const hash1 = shockResearchInputHash(base, null);
const hashReordered = shockResearchInputHash({ ...base, sources: [...base.sources].reverse(), tags: [...(base.tags ?? [])].reverse() }, null);
assert.equal(hash1, hashReordered, "source/tag ordering must not create a new research definition");

const futureOutcomeChanged: HistoricalShockCase = {
  ...base,
  outcome: { summary: "realized later", recoveryPattern: "fast" },
};
assert.equal(hash1, shockResearchInputHash(futureOutcomeChanged, null), "realized outcome must never be part of pre-outcome snapshot hash");

const scoreChanged: HistoricalShockCase = {
  ...base,
  scores: { ...base.scores, priceStabilization: 1 },
  score: 12,
  label: "watch",
};
assert.notEqual(hash1, shockResearchInputHash(scoreChanged, null), "score definition changes must move the snapshot hash");

const snapshot1 = buildShockResearchSnapshot([base], contexts, "2026-07-31");
const snapshot2 = buildShockResearchSnapshot([base], contexts, "2026-08-01");
assert.equal(snapshot1.aggregateSha256, snapshot2.aggregateSha256, "generation date must not alter the research input hash");
assertShockResearchSnapshot(snapshot1);
assert.equal(snapshot1.cases.length, 1);
assert.equal(snapshot1.cases[0].inputSha256, hash1);

console.log("idiosyncratic-shock research snapshot tests: OK");
