import assert from "node:assert/strict";
import { validateHistoricalContextEnvelope } from "../src/idiosyncratic-shock-context-envelope.js";

const valid = validateHistoricalContextEnvelope({
  version: 1,
  generatedAt: "2026-07-31",
  description: "fixture",
  cases: {
    "fixture-case": { incidentCountry: "JP" },
  },
}, "valid");
assert.equal(valid.version, 1);
assert.equal(valid.generatedAt, "2026-07-31");
assert.deepEqual(Object.keys(valid.cases), ["fixture-case"]);

assert.throws(
  () => validateHistoricalContextEnvelope({ version: 2, generatedAt: "2026-07-31", cases: {} }, "bad-version"),
  /bad-version\.version: expected 1/,
);
assert.throws(
  () => validateHistoricalContextEnvelope({ version: 1, generatedAt: "20260731", cases: {} }, "bad-date-format"),
  /bad-date-format\.generatedAt: expected valid YYYY-MM-DD/,
);
assert.throws(
  () => validateHistoricalContextEnvelope({ version: 1, generatedAt: "2026-02-31", cases: {} }, "bad-calendar-date"),
  /bad-calendar-date\.generatedAt: expected valid YYYY-MM-DD/,
);
assert.throws(
  () => validateHistoricalContextEnvelope({ version: 1, generatedAt: "2026-07-31", cases: [] }, "bad-cases"),
  /bad-cases\.cases: expected object/,
);
assert.throws(
  () => validateHistoricalContextEnvelope({ version: 1, generatedAt: "2026-07-31", cases: { "": {} } }, "empty-id"),
  /empty-id\.cases: empty case id/,
);
assert.throws(
  () => validateHistoricalContextEnvelope({ version: 1, generatedAt: "2026-07-31", cases: { x: "bad" } }, "bad-row"),
  /bad-row\.cases\.x: expected object/,
);
assert.throws(
  () => validateHistoricalContextEnvelope({ version: 1, generatedAt: "2026-07-31", description: 123, cases: {} }, "bad-description"),
  /bad-description\.description: expected string/,
);

console.log("idiosyncratic-shock context envelope tests: OK");
