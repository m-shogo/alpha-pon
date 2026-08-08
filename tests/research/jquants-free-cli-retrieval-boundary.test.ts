import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DailyQuote } from "../../src/fetcher/jquants.js";
import {
  assertFirstExecutableAtAfterRetrievalStart,
  parseExplicitIso8601Instant,
} from "../../src/research/jquants-free-cli-boundary.js";
import { JQuantsFreePriceProvider } from "../../src/research/providers/jquants-free.js";

{
  assert.equal(
    parseExplicitIso8601Instant("2024-02-29T12:34:56Z", "instant"),
    Date.parse("2024-02-29T12:34:56Z"),
  );
  assert.equal(
    parseExplicitIso8601Instant("2026-08-08T12:34:56.123456789+09:00", "instant"),
    Date.parse("2026-08-08T12:34:56.123+09:00"),
  );
  assert.equal(
    parseExplicitIso8601Instant("2026-08-08T12:34:56-05:00", "instant"),
    Date.parse("2026-08-08T12:34:56-05:00"),
  );
  assert.doesNotThrow(() => parseExplicitIso8601Instant("2026-08-08T12:34:56+14:00", "instant"));
  assert.throws(
    () => parseExplicitIso8601Instant("2026-08-08T12:34:56", "instant"),
    /explicit timezone/,
  );
  assert.throws(
    () => parseExplicitIso8601Instant("2026-08-08", "instant"),
    /explicit timezone/,
  );
  assert.throws(
    () => parseExplicitIso8601Instant("2026-02-29T12:34:56Z", "instant"),
    /valid Gregorian/,
  );
  assert.throws(
    () => parseExplicitIso8601Instant("2026-08-08T24:00:00Z", "instant"),
    /valid Gregorian/,
  );
  assert.throws(
    () => parseExplicitIso8601Instant("2026-08-08T12:34:56+14:01", "instant"),
    /timezone offset/,
  );
  assert.throws(
    () => parseExplicitIso8601Instant("2026-08-08T12:34:56+15:00", "instant"),
    /timezone offset/,
  );
  console.log("jquants-free-cli-retrieval-boundary: explicit ISO instant parser fails closed OK");
}

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
  const preflightIndex = source.indexOf(
    "assertFirstExecutableAtAfterRetrievalStart(firstExecutableAt, retrievalStartedAt)",
  );
  const fetchIndex = source.indexOf("await provider.fetchDaily(");
  assert.ok(preflightIndex >= 0, "CLI must invoke retrieval-start timing preflight");
  assert.ok(fetchIndex >= 0, "CLI must contain provider fetch");
  assert.ok(preflightIndex < fetchIndex, "timing preflight must execute before provider/network fetch");
  assert.equal(
    source.includes("now: () => retrievalStartedAt"),
    false,
    "CLI must not stamp retrievedAt with the pre-network retrieval start",
  );
  assert.match(
    source,
    /parseExplicitIso8601Instant\(value, `--\$\{name\}`\)/,
    "CLI timestampArg must use the strict explicit-timezone parser",
  );
  assert.match(
    source,
    /resolveFirstExecutableAt: \(\{ observedAt, retrievedAt \}\) =>/,
    "CLI resolver must receive the actual provider retrievedAt",
  );
  assert.match(
    source,
    /parseExplicitIso8601Instant\(retrievedAt, "provider retrievedAt"\)/,
    "CLI resolver must parse provider retrievedAt explicitly",
  );
  assert.match(
    source,
    /--first-executable-at must be at or after actual retrievedAt/,
    "CLI must keep an actual-retrieval completion guard",
  );
  assert.match(
    source,
    /asOf: retrievalStartedAt\.toISOString\(\)/,
    "query cutoff may use retrieval start without rewriting record retrievedAt",
  );
  assert.match(
    source,
    /appendPrivatePriceRecords\([\s\S]*?now: new Date\(\),/,
    "local append validation clock must be sampled after fetch",
  );
  console.log("jquants-free-cli-retrieval-boundary: strict instant parsing and actual retrievedAt stay separated structurally OK");
}

{
  const calls: string[] = [];
  const quote: DailyQuote = {
    Code: "81360",
    Date: "20260514",
    Open: 7200,
    High: 7350,
    Low: 7150,
    Close: 7300,
    Volume: 1_234_500,
    AdjustmentFactor: 1,
    AdjustmentClose: 7300,
    AdjustmentVolume: 1_234_500,
  };
  const provider = new JQuantsFreePriceProvider({
    fetchQuotes: async () => {
      calls.push("fetch-start");
      await Promise.resolve();
      calls.push("fetch-complete");
      return [quote];
    },
    now: () => {
      calls.push("retrieved-at-sampled");
      return new Date("2026-08-07T03:00:00.000Z");
    },
    resolveFirstExecutableAt: ({ retrievedAt }) => {
      assert.equal(retrievedAt, "2026-08-07T03:00:00.000Z");
      return "2026-08-07T12:00:01+09:00";
    },
  });
  const batch = await provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-05-14",
    to: "2026-05-14",
    asOf: "2026-08-07T02:59:59.000Z",
    plan: "free",
  });
  assert.deepEqual(calls, ["fetch-start", "fetch-complete", "retrieved-at-sampled"]);
  assert.equal(batch.retrievedAt, "2026-08-07T03:00:00.000Z");
  assert.equal(batch.records[0]?.retrievedAt, batch.retrievedAt);
  console.log("jquants-free-cli-retrieval-boundary: provider samples retrievedAt after fetch completion OK");
}

console.log("jquants-free-cli-retrieval-boundary.test.ts passed");
