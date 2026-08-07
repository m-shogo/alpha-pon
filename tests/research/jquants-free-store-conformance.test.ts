import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DailyQuote } from "../../src/fetcher/jquants.js";
import { jquantsFreeRecordOutput } from "../../src/research/providers/jquants-free-output.js";
import { mapJQuantsFreeQuote } from "../../src/research/providers/jquants-free.js";
import {
  validatePriceRecord,
  withPriceRecordHash,
} from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;

const quote: DailyQuote = {
  Code: "81360",
  Date: "20260514",
  Open: 7200,
  High: 7350,
  Low: 7150,
  Close: 7300,
  Volume: 1_234_500,
  AdjustmentFactor: 0.5,
  AdjustmentClose: 3650,
  AdjustmentVolume: 2_469_000,
};

function recordFor(source: DailyQuote) {
  return withPriceRecordHash(mapJQuantsFreeQuote({
    requestedCode: "8136",
    quote: source,
    retrievedAt: "2026-08-07T02:30:00.000Z",
    firstExecutableAt: "2026-08-07T09:00:00+09:00",
    ingestionRunId: "jquants-free-fixture-conformance",
  }));
}

{
  const record = recordFor(quote);
  const issues = validatePriceRecord(record, schema, new Date("2026-08-07T03:00:00.000Z"));
  const errors = issues.filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, []);
  assert.ok(issues.some((issue) => issue.code === "missing_benchmark" && issue.severity === "warning"));
  console.log("jquants-free-store-conformance: traded record passes canonical price schema OK");
}

{
  const record = recordFor({ ...quote, Open: 0, High: 0, Low: 0, Close: 0, Volume: 0 });
  const issues = validatePriceRecord(record, schema, new Date("2026-08-07T03:00:00.000Z"));
  assert.deepEqual(issues.filter((issue) => issue.severity === "error"), []);
  assert.equal(record.status, "missing");
  assert.equal(record.missingReason, "unknown");
  assert.equal(record.ohlcv, undefined);
  console.log("jquants-free-store-conformance: unknown missing row passes fail-closed schema OK");
}

{
  const record = recordFor(quote);
  const redacted = jquantsFreeRecordOutput(record);
  assert.equal(redacted.valuesIncluded, false);
  assert.equal(redacted.ohlcv, undefined);
  const serialized = JSON.stringify(redacted);
  assert.equal(serialized.includes("7300"), false);
  assert.equal(serialized.includes("1234500"), false);

  const explicitLocal = jquantsFreeRecordOutput(record, true);
  assert.equal(explicitLocal.valuesIncluded, true);
  assert.deepEqual(explicitLocal.ohlcv, record.ohlcv);
  console.log("jquants-free-store-conformance: raw OHLCV is redacted unless explicitly requested OK");
}

console.log("jquants-free-store-conformance.test.ts passed");
