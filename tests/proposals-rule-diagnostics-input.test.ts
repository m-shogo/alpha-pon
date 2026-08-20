import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readCurrentProposalRuleDiagnostics,
  readProposalRuleDiagnostics,
} from "../src/proposals-rule-diagnostics-input.js";

type Row = {
  rule: string;
  diagnosis: string;
  directionExpectation: number;
  avgRelativeReturnPct: number | null;
  avgLossRelativeReturnPct: number | null;
};

const dir = mkdtempSync(join(tmpdir(), "proposal-rule-diagnostics-"));
const path = join(dir, "rule_diagnostics_latest.json");
const canonicalRow: Row = {
  rule: "official_ir_confirmed",
  diagnosis: "condition_required",
  directionExpectation: -0.25,
  avgRelativeReturnPct: -1.2,
  avgLossRelativeReturnPct: -3.4,
};

try {
  writeFileSync(path, JSON.stringify([canonicalRow]), "utf-8");
  assert.equal(readProposalRuleDiagnostics<Row>(path).length, 1, "canonical diagnostics remain usable");

  writeFileSync(path, JSON.stringify({ diagnostics: [] }), "utf-8");
  assert.throws(
    () => readProposalRuleDiagnostics<Row>(path),
    /proposal rule diagnostics root must be an array/,
    "an object root must fail closed before proposals calls Array.filter",
  );

  writeFileSync(path, JSON.stringify([
    {
      ...canonicalRow,
      diagnosis: "weaken_candidate",
      directionExpectation: "broken",
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

  writeFileSync(join(dir, "rule_diagnostics_latest.json"), JSON.stringify([
    { ...canonicalRow, rule: "stale-rule" },
  ]), "utf-8");
  writeFileSync(join(dir, "rule_diagnostics_2026-08-20.json"), JSON.stringify([
    { ...canonicalRow, rule: "current-rule" },
  ]), "utf-8");
  assert.deepEqual(
    readCurrentProposalRuleDiagnostics<Row>(dir, "2026-08-20").map(row => row.rule),
    ["current-rule"],
    "proposal generation must use the dated current rule diagnostics snapshot instead of stale latest evidence",
  );
  assert.deepEqual(
    readCurrentProposalRuleDiagnostics<Row>(dir, "2026-08-21"),
    [],
    "missing current diagnostics must not fall back to a stale latest snapshot",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("proposals-rule-diagnostics-input: malformed-shape and current-date provenance regressions OK");
