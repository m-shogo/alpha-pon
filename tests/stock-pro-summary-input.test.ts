import { normalizeStockProAgentReportText } from "../src/stock-pro-summary-input.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(normalizeStockProAgentReportText("# report\n- final label: **調査候補**\n") === "# report\n- final label: **調査候補**", "usable report text must remain available when no asOf is requested");
assert(normalizeStockProAgentReportText("   \n\t  ") === "", "blank-only report text must fail closed as unavailable");
assert(normalizeStockProAgentReportText(null) === "", "non-string report input must fail closed as unavailable");

const currentReport = "# report\n\n生成日: 2026-08-19\n\n- final label: **調査候補**\n";
assert(normalizeStockProAgentReportText(currentReport, "2026-08-19").includes("調査候補"), "same-day report must remain usable");
assert(normalizeStockProAgentReportText(currentReport, "2026-08-20") === "", "stale report must not be reused as current summary evidence");
assert(normalizeStockProAgentReportText("# report\n- final label: **調査候補**", "2026-08-19") === "", "report without generated date must fail closed for current summary use");

console.log("stock pro summary input tests passed");
