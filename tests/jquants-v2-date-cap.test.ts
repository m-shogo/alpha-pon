import assert from "node:assert/strict";
import {
  fetchDailyQuotes,
  jquantsV2DateCapCompact,
  normalizeV2QuoteRange,
} from "../src/fetcher/jquants.js";
import { parsePrimaryDisclosureEdinetDays } from "../src/primary-disclosure-config.js";
import { resolveWorldImpactJquantsDelayDays } from "../src/world-impact-evaluation-input.js";

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
  assert.equal(parsePrimaryDisclosureEdinetDays(undefined), 5, "EDINET scan days未指定は既定5営業日");
  assert.equal(parsePrimaryDisclosureEdinetDays("5"), 5, "正の整数を保持する");
  assert.equal(parsePrimaryDisclosureEdinetDays("30"), 30, "上限30営業日を許可する");
  assert.equal(parsePrimaryDisclosureEdinetDays("31"), 30, "上限超過は30営業日へ丸める");
  assert.equal(parsePrimaryDisclosureEdinetDays("abc"), 5, "非numeric値は既定値へfail-closedする");
  assert.equal(parsePrimaryDisclosureEdinetDays("0"), 5, "0は既定値へfail-closedする");
  assert.equal(parsePrimaryDisclosureEdinetDays("-1"), 5, "負数は既定値へfail-closedする");
  assert.equal(parsePrimaryDisclosureEdinetDays("1.5"), 5, "小数は既定値へfail-closedする");
  assert.equal(parsePrimaryDisclosureEdinetDays("5days"), 5, "部分parse可能な値をrejectする");
  console.log("primary-disclosure-config: EDINET scan day config is bounded and fail closed OK");
}

{
  assert.equal(resolveWorldImpactJquantsDelayDays(undefined), 84, "World Impact J-Quants delay未指定は84日");
  assert.equal(resolveWorldImpactJquantsDelayDays("84"), 84, "非負整数delayを保持する");
  assert.equal(resolveWorldImpactJquantsDelayDays("0"), 0, "0日delayを明示指定できる");
  assert.equal(resolveWorldImpactJquantsDelayDays("abc"), 84, "非numeric delayは既定値へfail-closedする");
  assert.equal(resolveWorldImpactJquantsDelayDays("-1"), 84, "負数delayは既定値へfail-closedする");
  assert.equal(resolveWorldImpactJquantsDelayDays("1.5"), 84, "小数delayは既定値へfail-closedする");
  assert.equal(resolveWorldImpactJquantsDelayDays("84days"), 84, "部分parse可能なdelayをrejectする");
  assert.equal(resolveWorldImpactJquantsDelayDays("9007199254740992"), 84, "unsafe integer delayをrejectする");
  console.log("world-impact-evaluation-input: J-Quants delay config is fail closed OK");
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
