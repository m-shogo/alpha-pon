import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DailyQuote } from "../../src/fetcher/jquants.js";
import {
  assertFirstExecutableAtAfterRetrievalStart,
  parseExplicitIso8601Instant,
} from "../../src/research/jquants-free-cli-boundary.js";
import { validateProviderBatchAgainstQuery } from "../../src/research/price-store-hardening.js";
import type { PriceProviderQuery } from "../../src/research/price-store.js";
import {
  JQuantsFreePriceProvider,
  mapJQuantsFreeQuote,
} from "../../src/research/providers/jquants-free.js";

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
  const fetchIndex = source.indexOf("await provider.fetchDaily(query)");
  const batchValidationIndex = source.indexOf("validateProviderBatchAgainstQuery(batch, query");
  assert.ok(preflightIndex >= 0, "CLI must invoke retrieval-start timing preflight");
  assert.ok(fetchIndex >= 0, "CLI must fetch through the preserved PriceProviderQuery object");
  assert.ok(batchValidationIndex > fetchIndex, "query-aware batch validation must run after provider fetch");
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
    /const query: PriceProviderQuery = \{[\s\S]*?asOf: retrievalStartedAt\.toISOString\(\)/,
    "CLI must preserve retrieval start as the query snapshot cutoff",
  );
  assert.match(
    source,
    /validateProviderBatchAgainstQuery\(batch, query, \{[\s\S]*?expectedSource: "jquants"/,
    "CLI must validate the returned batch against its exact query and source",
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
    /appendPrivatePriceRecords\([\s\S]*?now: new Date\(\),/,
    "local append validation clock must be sampled after fetch",
  );
  console.log("jquants-free-cli-retrieval-boundary: query cutoff and actual retrievedAt stay separated structurally OK");
}

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

{
  const calls: string[] = [];
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

{
  const cutoffQuote: DailyQuote = { ...quote, Date: "20260515" };
  const query: PriceProviderQuery = {
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-05-15",
    to: "2026-05-15",
    // Free observedAt for 2026-05-15 is 2026-08-07T23:59:59+09:00,
    // one second after this snapshot cutoff.
    asOf: "2026-08-07T14:59:58.000Z",
    plan: "free",
  };
  let resolverCalls = 0;
  const provider = new JQuantsFreePriceProvider({
    fetchQuotes: async () => [cutoffQuote],
    now: () => new Date("2026-08-07T15:00:01.000Z"),
    resolveFirstExecutableAt: () => {
      resolverCalls += 1;
      return "2026-08-08T00:01:00+09:00";
    },
  });
  const batch = await provider.fetchDaily(query);
  assert.equal(batch.records.length, 0);
  assert.equal(resolverCalls, 0, "resolver must not run for rows outside the snapshot cutoff");
  assert.deepEqual(validateProviderBatchAgainstQuery(batch, query, { expectedSource: "jquants" }), []);
  console.log("jquants-free-cli-retrieval-boundary: direct provider omits rows observed after query.asOf OK");
}

{
  const futureQuote: DailyQuote = { ...quote, Date: "20260515" };
  const query: PriceProviderQuery = {
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-05-14",
    to: "2026-05-15",
    asOf: "2026-08-07T14:59:58.000Z",
    plan: "free",
  };
  let resolverCalls = 0;
  const provider = new JQuantsFreePriceProvider({
    fetchQuotes: async () => [quote, futureQuote],
    now: () => new Date("2026-08-07T15:00:01.000Z"),
    resolveFirstExecutableAt: () => {
      resolverCalls += 1;
      return "2026-08-08T00:01:00+09:00";
    },
  });
  const batch = await provider.fetchDaily(query);
  assert.deepEqual(batch.records.map(record => record.tradingDate), ["2026-05-14"]);
  assert.equal(resolverCalls, 1, "resolver must run only for the snapshot-eligible row");
  assert.deepEqual(validateProviderBatchAgainstQuery(batch, query, { expectedSource: "jquants" }), []);
  console.log("jquants-free-cli-retrieval-boundary: direct provider preserves eligible rows in partial cutoff range OK");
}

{
  let fetchCalls = 0;
  const provider = new JQuantsFreePriceProvider({
    fetchQuotes: async () => {
      fetchCalls += 1;
      return [quote];
    },
    now: () => new Date("2026-08-07T15:00:01.000Z"),
    resolveFirstExecutableAt: () => "2026-08-08T00:01:00+09:00",
  });
  await assert.rejects(() => provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-05-14",
    to: "2026-05-14",
    asOf: "2026-08-07T14:59:58",
    plan: "free",
  }), /query\.asOf must be an ISO-8601 timestamp with explicit timezone/);
  assert.equal(fetchCalls, 0, "invalid query.asOf must fail before network fetch");
  console.log("jquants-free-cli-retrieval-boundary: direct provider rejects implicit query.asOf before fetch OK");
}

{
  assert.throws(() => mapJQuantsFreeQuote({
    requestedCode: "8136",
    quote,
    retrievedAt: "2026-08-07T03:00:00",
    firstExecutableAt: "2026-08-07T12:00:01+09:00",
    ingestionRunId: "direct-map-timezone-less-retrieval",
  }), /retrievedAt must be an ISO-8601 timestamp with explicit timezone/);
  assert.throws(() => mapJQuantsFreeQuote({
    requestedCode: "8136",
    quote,
    retrievedAt: "2026-08-07T03:00:00.000Z",
    firstExecutableAt: "2026-08-07T12:00:01",
    ingestionRunId: "direct-map-timezone-less-execution",
  }), /firstExecutableAt must be an ISO-8601 timestamp with explicit timezone/);
  console.log("jquants-free-cli-retrieval-boundary: direct map rejects implicit timestamp zones OK");
}

{
  const provider = new JQuantsFreePriceProvider({
    fetchQuotes: async () => [quote],
    now: () => new Date("2026-08-07T03:00:00.000Z"),
    resolveFirstExecutableAt: () => "2026-08-07T12:00:01",
  });
  await assert.rejects(() => provider.fetchDaily({
    seriesKind: "security",
    codes: ["8136"],
    from: "2026-05-14",
    to: "2026-05-14",
    asOf: "2026-08-07T02:59:59.000Z",
    plan: "free",
  }), /firstExecutableAt must be an ISO-8601 timestamp with explicit timezone/);
  console.log("jquants-free-cli-retrieval-boundary: direct provider rejects implicit resolver timestamp zones OK");
}

console.log("jquants-free-cli-retrieval-boundary.test.ts passed");
