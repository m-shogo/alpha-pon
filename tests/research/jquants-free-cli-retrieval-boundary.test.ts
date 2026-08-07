import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertFirstExecutableAtAfterRetrievalStart } from "../../src/research/jquants-free-cli-boundary.js";

{
  const startedAt = new Date("2026-08-07T03:00:00.000Z");
  assert.doesNotThrow(() => assertFirstExecutableAtAfterRetrievalStart(
    "2026-08-07T12:00:00+09:00",
    startedAt,
  ));
  assert.doesNotThrow(() => assertFirstExecutableAtAfterRetrievalStart(
    "2026-08-07T12:00:01+09:00",
    startedAt,
  ));
  assert.throws(() => assertFirstExecutableAtAfterRetrievalStart(
    "2026-08-07T11:59:59+09:00",
    startedAt,
  ), /must be at or after retrieval start/);
  console.log("jquants-free-cli-retrieval-boundary: equal/after pass and pre-retrieval execution rejects OK");
}

{
  assert.throws(() => assertFirstExecutableAtAfterRetrievalStart(
    "not-a-timestamp",
    new Date("2026-08-07T03:00:00.000Z"),
  ), /ISO-8601 timestamp/);
  assert.throws(() => assertFirstExecutableAtAfterRetrievalStart(
    "2026-08-07T12:00:00+09:00",
    new Date(Number.NaN),
  ), /retrieval start must be a valid timestamp/);
  console.log("jquants-free-cli-retrieval-boundary: malformed timestamps fail closed OK");
}

{
  const source = readFileSync("src/research/cli/fetch-jquants-free-price.ts", "utf-8");
  const preflightIndex = source.indexOf("assertFirstExecutableAtAfterRetrievalStart(firstExecutableAt, now)");
  const fetchIndex = source.indexOf("await provider.fetchDaily(");
  assert.ok(preflightIndex >= 0, "CLI must invoke retrieval-start timing preflight");
  assert.ok(fetchIndex >= 0, "CLI must contain provider fetch");
  assert.ok(preflightIndex < fetchIndex, "timing preflight must execute before provider/network fetch");
  console.log("jquants-free-cli-retrieval-boundary: timing preflight stays before network fetch structurally OK");
}

console.log("jquants-free-cli-retrieval-boundary.test.ts passed");
