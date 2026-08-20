import { isStockProCommitteeDecision } from "../src/stock-pro-committee-input.js";

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

console.log("Stock Pro committee input tests passed");
