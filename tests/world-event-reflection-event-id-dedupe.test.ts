import assert from "node:assert/strict";
import { classifyWorldEvent } from "../src/analysis/world-event-map.js";
import { buildWorldEventReflections } from "../src/analysis/world-event-reflection.js";

const first = classifyWorldEvent({
  title: "Official statement: AI datacenter power grid investment announced",
  url: "https://www.gov.example/statement-a",
  source: "Government",
  publishedAt: "2026-08-20T00:00:00Z",
  snippet: "confirmed official statement about AI datacenter power grid investment",
});
const duplicateIdentity = classifyWorldEvent({
  title: "Official statement: AI datacenter power grid investment announced",
  url: "https://www.gov.example/statement-b",
  source: "Government",
  publishedAt: "2026-08-20T01:00:00Z",
  snippet: "same titled official statement mirrored by another source endpoint",
});

const reflections = buildWorldEventReflections([first, duplicateIdentity], "2026-08-20", 8);
assert.equal(reflections.length, 1, "producer must not emit duplicate canonical reflection eventIds");
assert.equal(new Set(reflections.map(row => row.eventId)).size, reflections.length);

const japaneseRate = classifyWorldEvent({
  title: "政策金利の変更を発表",
  url: "https://www.gov.example/rate",
  source: "Government",
  publishedAt: "2026-08-20T02:00:00Z",
  snippet: "公式発表 金利 銀行 信用",
});
const japaneseDisaster = classifyWorldEvent({
  title: "大規模地震への復旧支援を発表",
  url: "https://www.gov.example/disaster",
  source: "Government",
  publishedAt: "2026-08-20T03:00:00Z",
  snippet: "公式発表 地震 災害 復旧",
});
const japaneseReflections = buildWorldEventReflections([japaneseRate, japaneseDisaster], "2026-08-20", 8);
assert.equal(japaneseReflections.length, 2, "distinct non-ASCII titles must not collapse to the same world-event identity");
assert.equal(new Set(japaneseReflections.map(row => row.eventId)).size, 2);
assert.ok(japaneseReflections.every(row => row.eventId !== "2026-08-20_world-event"));

console.log("world-event reflection event id dedupe: canonical producer preserves duplicate and unicode identities safely");
