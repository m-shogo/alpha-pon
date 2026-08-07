import assert from "node:assert/strict";
import {
  fetchDailyQuotes,
  jquantsV2DateCapCompact,
  normalizeV2QuoteRange,
} from "../src/fetcher/jquants.js";

{
  const beforeJstMidnight = new Date("2026-08-07T14:30:00.000Z"); // 23:30 JST Aug 7
  const afterJstMidnight = new Date("2026-08-07T15:30:00.000Z"); // 00:30 JST Aug 8
  assert.equal(jquantsV2DateCapCompact(beforeJstMidnight, 84), "20260515");
  assert.equal(jquantsV2DateCapCompact(afterJstMidnight, 84), "20260516");
  console.log("jquants-v2-date-cap: entitlement cap uses JST calendar date OK");
}

{
  const now = new Date("2026-08-07T15:30:00.000Z"); // Aug 8 JST, cap May 16
  assert.deepEqual(
    normalizeV2QuoteRange("2026-05-14", "2026-08-08", now, 84),
    { from: "20260514", to: "20260516" },
  );
  assert.deepEqual(
    normalizeV2QuoteRange("2026-05-16", "2026-05-16", now, 84),
    { from: "20260516", to: "20260516" },
  );
  assert.equal(
    normalizeV2QuoteRange("2026-05-17", "2026-08-08", now, 84),
    null,
  );
  console.log("jquants-v2-date-cap: future-only ranges do not shift backwards OK");
}

{
  const now = new Date("2026-08-07T15:30:00.000Z");
  assert.throws(
    () => normalizeV2QuoteRange("2026-05-20", "2026-05-10", now, 84),
    /from must be on or before to/,
  );
  assert.throws(
    () => normalizeV2QuoteRange("2026/05/10", "2026-05-20", now, 84),
    /must be YYYY-MM-DD or YYYYMMDD/,
  );
  assert.throws(
    () => jquantsV2DateCapCompact(now, -1),
    /non-negative integer/,
  );
  console.log("jquants-v2-date-cap: invalid range and delay fail closed OK");
}

{
  const previousApiKey = process.env.JQUANTS_API_KEY;
  const previousFetch = globalThis.fetch;
  let networkCalls = 0;
  try {
    process.env.JQUANTS_API_KEY = "fixture-key";
    globalThis.fetch = (async () => {
      networkCalls += 1;
      throw new Error("network must not be called for an ineligible range");
    }) as typeof fetch;

    const rows = await fetchDailyQuotes("8136", "2099-01-01", "2099-01-02");
    assert.deepEqual(rows, []);
    assert.equal(networkCalls, 0);
  } finally {
    if (previousApiKey === undefined) delete process.env.JQUANTS_API_KEY;
    else process.env.JQUANTS_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch;
  }
  console.log("jquants-v2-date-cap: ineligible future-only fetch performs zero network calls OK");
}

console.log("jquants-v2-date-cap.test.ts passed");
