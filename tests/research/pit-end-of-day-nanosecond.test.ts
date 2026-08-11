import assert from "node:assert/strict";
import { checkPit } from "../../src/research/pit.js";
import { makeEdge, makeState } from "./helpers.js";

const edge = makeEdge();
edge.createdAt = "2024-02-01";
edge.lastUpdate = "2024-02-01";
edge.evidence = [{
  source: "synthetic-fixture",
  sourceType: "company_ir",
  observedAt: "2024-02-01T23:59:59.999999999+09:00",
  eventDate: "2024-02-01",
  summary: "final nanosecond of the JST snapshot day",
}];

const sameDayIssues = checkPit(
  makeState({ edges: [edge] }),
  new Date("2024-02-01T14:59:59.999Z"),
);
assert.equal(
  sameDayIssues.some((issue) => issue.code === "future_timestamp"),
  false,
  "the final nanosecond of a JST day cutoff must not be rejected as future",
);

edge.evidence[0]!.observedAt = "2024-02-02T00:00:00+09:00";
const nextDayIssues = checkPit(
  makeState({ edges: [edge] }),
  new Date("2024-02-01T14:59:59.999Z"),
);
assert.ok(
  nextDayIssues.some((issue) => issue.code === "future_timestamp"),
  "the next JST day must remain future at the prior day cutoff",
);

console.log("research/pit-end-of-day-nanosecond.test.ts passed");
