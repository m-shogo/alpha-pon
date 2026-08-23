import { isCurrentStockProCommitteeGeneratedAt, isStockProCommitteeDecision, parseStockProCommitteeIrEventEvidence } from "../src/stock-pro-committee-input.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  isStockProCommitteeDecision({ code: "8136", name: "Sanrio", finalLabel: "保留", finalScore: 62, originalFinalLabel: "保留" }),
  "canonical Stock Pro committee decisions must remain usable",
);

for (const invalid of [
  {},
  { code: " 8136", name: "Sanrio", finalLabel: "保留", finalScore: 62 },
  { code: "8136", name: "", finalLabel: "保留", finalScore: 62 },
  { code: "8136", name: "Sanrio", finalLabel: "", finalScore: 62 },
  { code: "8136", name: "Sanrio", finalLabel: "保留", finalScore: "62" },
  { code: "8136", name: "Sanrio", finalLabel: "保留", finalScore: Number.NaN },
]) {
  assert(!isStockProCommitteeDecision(invalid), `malformed committee decision must be isolated: ${JSON.stringify(invalid)}`);
}

assert(isCurrentStockProCommitteeGeneratedAt("2026-08-20", "2026-08-20"), "current JST report date must remain usable");
for (const invalidDate of ["2026-08-19", "2026-08-21", "2026-02-31", "0000-01-01", "2026-08-20T00:00:00+09:00", null]) {
  assert(
    !isCurrentStockProCommitteeGeneratedAt(invalidDate, "2026-08-20"),
    `stale or invalid Stock Pro report date must fail closed: ${String(invalidDate)}`,
  );
}

const canonicalIrEvent = {
  code: "8136",
  name: "Sanrio",
  eventType: "earnings",
  title: "FY results",
  publishedAt: "2026-08-20",
  eventDate: "2026-08-20",
  sourceUrl: "https://example.com/ir",
  sourceStatus: "confirmed",
  impact: "neutral",
  confidence: 0.8,
  notes: [],
};
assert(parseStockProCommitteeIrEventEvidence({ events: [canonicalIrEvent] }).length === 1, "canonical IR evidence must remain usable");
for (const malformed of [null, [], {}, { events: {} }, { events: [null] }, { events: [{ ...canonicalIrEvent, code: " 8136 " }] }]) {
  assert(
    parseStockProCommitteeIrEventEvidence(malformed).length === 0,
    `malformed IR evidence collection must fail closed: ${JSON.stringify(malformed)}`,
  );
}

console.log("Stock Pro committee input tests passed");