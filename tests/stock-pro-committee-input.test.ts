import { isCurrentStockProCommitteeGeneratedAt, isStockProCommitteeDecision, parseStockProCommitteeCodeSnapshots, parseStockProCommitteeIrEventEvidence, parseStockProCommitteeOutcomes } from "../src/stock-pro-committee-input.js";

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

const canonicalSnapshot = {
  code: "8136",
  name: "Sanrio",
  asOf: "2026-08-20",
  growthAdjustedValuation: "reasonable",
  valuationRisks: [],
  missingData: [],
};
assert(parseStockProCommitteeCodeSnapshots<typeof canonicalSnapshot>({ snapshots: [canonicalSnapshot] }).length === 1, "canonical Stock Pro snapshot must remain usable");
const canonicalQualitySnapshot = {
  code: "9984",
  name: "SoftBank Group",
  asOf: "2026-08-20",
  qualityLabel: "good_business",
  moatEvidence: [],
  missingData: [],
};
assert(parseStockProCommitteeCodeSnapshots<typeof canonicalQualitySnapshot>({ snapshots: [canonicalQualitySnapshot] }).length === 1, "canonical quality snapshot must remain usable");
const uniqueAlongsideDuplicate = parseStockProCommitteeCodeSnapshots<typeof canonicalSnapshot | typeof canonicalQualitySnapshot>({
  snapshots: [
    canonicalSnapshot,
    { ...canonicalSnapshot, valuationRisks: ["duplicate evidence"] },
    canonicalQualitySnapshot,
  ],
});
assert(uniqueAlongsideDuplicate.length === 1 && uniqueAlongsideDuplicate[0]?.code === "9984", "ambiguous duplicate snapshot identities must be isolated while unique snapshots remain usable");
for (const malformed of [
  null,
  [],
  {},
  { snapshots: {} },
  { snapshots: [null] },
  { snapshots: [{ ...canonicalSnapshot, code: " 8136 " }] },
  { snapshots: [{ code: "8136", name: "Sanrio", asOf: "2026-08-20" }] },
  { snapshots: [{ ...canonicalSnapshot, valuationRisks: "none" }] },
  { snapshots: [{ ...canonicalQualitySnapshot, moatEvidence: "brand" }] },
  { snapshots: [{ ...canonicalSnapshot, asOf: "2026-02-31" }] },
  { snapshots: [{ ...canonicalSnapshot, asOf: "2999-01-01" }] },
]) {
  assert(
    parseStockProCommitteeCodeSnapshots(malformed).length === 0,
    `malformed Stock Pro snapshot collection must fail closed: ${JSON.stringify(malformed)}`,
  );
}

const canonicalOutcome = { code: "8136", maxDrawdownPct: -8 };
assert(parseStockProCommitteeOutcomes({ outcomes: [canonicalOutcome] }).length === 1, "canonical outcome collection must remain usable");
assert(parseStockProCommitteeOutcomes({ outcomes: [{ code: "8136", maxDrawdownPct: null }] }).length === 1, "canonical outcome with unavailable drawdown must remain usable");
assert(parseStockProCommitteeOutcomes({ outcomes: [{ code: "8136", maxDrawdownPct: 0 }] }).length === 1, "zero max drawdown must remain usable");
for (const malformed of [
  null,
  [],
  {},
  { outcomes: {} },
  { outcomes: [null] },
  { outcomes: [{}] },
  { outcomes: [{ code: " 8136 ", maxDrawdownPct: -8 }] },
  { outcomes: [{ code: "8136" }] },
  { outcomes: [{ code: "8136", maxDrawdownPct: "-8" }] },
  { outcomes: [{ code: "8136", maxDrawdownPct: Number.NaN }] },
  { outcomes: [{ code: "8136", maxDrawdownPct: 8 }] },
]) {
  assert(
    parseStockProCommitteeOutcomes(malformed).length === 0,
    `malformed outcome collection must fail closed: ${JSON.stringify(malformed)}`,
  );
}

console.log("Stock Pro committee input tests passed");
