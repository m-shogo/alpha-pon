import assert from "node:assert/strict";
import {
  evaluateGate,
  type HoldoutAccessEntry,
} from "../../src/research/promotion.js";
import { GATE_KEYS, type Edge } from "../../src/research/types.js";
import { makeEdge, makeState } from "./helpers.js";

const AS_OF = "2024-02-01";

function passAllGates(edge: Edge): Edge {
  for (const key of GATE_KEYS) {
    edge.promotionGate[key] = {
      state: "pass",
      evidence: `nanosecond boundary fixture (${key})`,
      checkedAt: AS_OF,
    };
  }
  edge.samples.current = edge.samples.required;
  return edge;
}

const edge = passAllGates(makeEdge());
const state = makeState({ edges: [edge] });
const endOfDayPass: HoldoutAccessEntry = {
  schemaVersion: 1,
  id: "holdout-end-of-day-pass",
  edgeId: edge.id,
  windowId: "fixture-window",
  openedAt: "2024-02-01T23:59:59.999999999+09:00",
  actor: "test",
  purpose: "production_gate",
  result: "pass",
};

const sameDay = evaluateGate(edge, state, [endOfDayPass], AS_OF);
assert.equal(
  sameDay.unsupportedPasses.some((item) => item.gate === "holdoutPass"),
  false,
  "the final nanosecond of the asOf JST day must remain eligible",
);

const nextDayPass: HoldoutAccessEntry = {
  ...endOfDayPass,
  id: "holdout-next-day-pass",
  openedAt: "2024-02-02T00:00:00+09:00",
};
const nextDay = evaluateGate(edge, state, [nextDayPass], AS_OF);
assert.ok(
  nextDay.unsupportedPasses.some((item) => item.gate === "holdoutPass"),
  "the next JST day must remain ineligible",
);

console.log("research/promotion-asof-nanosecond.test.ts passed");
