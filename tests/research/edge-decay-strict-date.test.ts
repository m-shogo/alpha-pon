import assert from "node:assert/strict";
import {
  buildDecayReport,
  checkDecay,
  classifyDecay,
} from "../../src/research/decay.js";
import type { Edge, ResearchState } from "../../src/research/types.js";

function edge(overrides: Partial<Edge["decay"]> = {}): Edge {
  return {
    id: "edge:decay-strict-date",
    title: "Decay strict date fixture",
    status: "production",
    decay: {
      reviewIntervalDays: 10,
      lastCheckedAt: "2026-08-01",
      score: 0.8,
      ...overrides,
    },
  } as Edge;
}

function state(one: Edge): ResearchState {
  return {
    edges: [one],
    analogs: [],
    counterfactuals: [],
    confounders: [],
    checkpoint: null,
  };
}

{
  assert.deepEqual(classifyDecay(edge(), "2026-08-05"), {
    status: "fresh",
    daysSinceCheck: 4,
  });
  assert.deepEqual(classifyDecay(edge(), "2026-08-09"), {
    status: "due_soon",
    daysSinceCheck: 8,
  });
  assert.deepEqual(classifyDecay(edge(), "2026-08-12"), {
    status: "overdue",
    daysSinceCheck: 11,
  });
  const report = buildDecayReport(state(edge()), "2026-08-12");
  assert.equal(report[0]?.decayStatus, "overdue");
  assert.equal(checkDecay(state(edge()), "2026-08-12")[0]?.code, "decay_overdue");
  console.log("edge-decay-strict-date: valid calendar-day decay classification stays deterministic OK");
}

{
  assert.throws(
    () => classifyDecay(edge(), "2026-02-31"),
    /decay asOf must be a real YYYY-MM-DD date/,
  );
  assert.throws(
    () => classifyDecay(edge({ lastCheckedAt: "2026-13-01" }), "2026-08-09"),
    /edge\.decay\.lastCheckedAt must be a real YYYY-MM-DD date/,
  );
  console.log("edge-decay-strict-date: impossible decay dates fail closed OK");
}

{
  assert.throws(
    () => classifyDecay(edge({ lastCheckedAt: "2026-08-10" }), "2026-08-09"),
    /lastCheckedAt must be on or before decay asOf/,
  );
  assert.throws(
    () => buildDecayReport(state(edge({ lastCheckedAt: "2026-08-10" })), "2026-08-09"),
    /lastCheckedAt must be on or before decay asOf/,
  );
  console.log("edge-decay-strict-date: future Decay check cannot masquerade as fresh OK");
}

{
  const neverChecked = edge({ lastCheckedAt: undefined });
  assert.deepEqual(classifyDecay(neverChecked, "2026-08-09"), {
    status: "never_checked",
    daysSinceCheck: null,
  });
  assert.throws(
    () => classifyDecay(neverChecked, "2026-02-31"),
    /decay asOf must be a real YYYY-MM-DD date/,
  );
  console.log("edge-decay-strict-date: never-checked path still validates snapshot date OK");
}

console.log("edge-decay-strict-date.test.ts passed");
