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

console.log("world-event reflection event id dedupe: canonical producer emits each event identity once");
