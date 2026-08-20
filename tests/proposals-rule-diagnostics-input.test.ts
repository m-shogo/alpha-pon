import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readProposalRuleDiagnostics } from "../src/proposals-rule-diagnostics-input.js";

type Row = {
  rule: string;
  diagnosis: string;
  directionExpectation: number;
  avgRelativeReturnPct: number | null;
  avgLossRelativeReturnPct: number | null;
};

const dir = mkdtempSync(join(tmpdir(), "proposal-rule-diagnostics-"));
const path = join(dir, "rule_diagnostics_latest.json");

try {
  writeFileSync(path, JSON.stringify([
    {
      rule: "official_ir_confirmed",
      diagnosis: "condition_required",
      directionExpectation: -0.25,
      avgRelativeReturnPct: -1.2,
      avgLossRelativeReturnPct: -3.4,
    },
  ]), "utf-8");
  assert.equal(readProposalRuleDiagnostics<Row>(path).length, 1, "canonical diagnostics remain usable");

  writeFileSync(path, JSON.stringify({ diagnostics: [] }), "utf-8");
  assert.throws(
    () => readProposalRuleDiagnostics<Row>(path),
    /proposal rule diagnostics root must be an array/,
    "an object root must fail closed before proposals calls Array.filter",
  );

  writeFileSync(path, JSON.stringify([
    {
      rule: "official_ir_confirmed",
      diagnosis: "weaken_candidate",
      directionExpectation: "broken",
      avgRelativeReturnPct: -1.2,
      avgLossRelativeReturnPct: -3.4,
    },
  ]), "utf-8");
  assert.throws(
    () => readProposalRuleDiagnostics<Row>(path),
    /proposal rule diagnostic shape is invalid at row\(s\) 1/,
    "unsafe numeric rows must fail closed before proposal evidence calls toFixed",
  );

  writeFileSync(path, "{", "utf-8");
  assert.throws(
    () => readProposalRuleDiagnostics<Row>(path),
    /proposal rule diagnostics must contain valid JSON/,
    "malformed JSON must not be treated as a legitimate zero-diagnostic day",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("proposals-rule-diagnostics-input: malformed rule diagnostics regressions OK");
