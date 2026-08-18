import { normalizeStockProAgentReportText } from "../src/stock-pro-summary-input.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(normalizeStockProAgentReportText("# report\n- final label: **調査候補**\n") === "# report\n- final label: **調査候補**", "usable report text must remain available");
assert(normalizeStockProAgentReportText("   \n\t  ") === "", "blank-only report text must fail closed as unavailable");
assert(normalizeStockProAgentReportText(null) === "", "non-string report input must fail closed as unavailable");

console.log("stock pro summary input tests passed");
