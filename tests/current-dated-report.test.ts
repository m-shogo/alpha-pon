import { normalizeCurrentDatedReportText } from "../src/current-dated-report.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const current = "# report\n\ndate: 2026-08-19\n\n- status: ok\n";
assert(normalizeCurrentDatedReportText(current, "2026-08-19").includes("status: ok"), "current report must remain usable");
assert(normalizeCurrentDatedReportText(current, "2026-08-20") === "", "stale report must fail closed");
assert(normalizeCurrentDatedReportText("# report\n- status: ok", "2026-08-19") === "", "undated report must fail closed");
assert(normalizeCurrentDatedReportText("   \n", "2026-08-19") === "", "blank report must fail closed");

console.log("current dated report tests passed");
