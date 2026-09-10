import assert from "node:assert/strict";
import { buildEventId, type MarketEventIdentityInput } from "../src/market-events/contracts.js";

const forgedRuntimeInput = {
  issuerCode: "8136",
  issuerName: "サンリオ",
  eventType: "NOT_A_MARKET_EVENT_TYPE",
  occurrenceKey: "FY2026-Q1",
} as unknown as MarketEventIdentityInput;

assert.throws(
  () => buildEventId(forgedRuntimeInput),
  /Unknown market event type: NOT_A_MARKET_EVENT_TYPE/,
  "stable event identity must fail closed on unknown runtime event types",
);

console.log("market-event-event-type-identity: ok");
