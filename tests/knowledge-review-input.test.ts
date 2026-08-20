import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readKnowledgeReviewJsonl } from "../src/knowledge-review-input.js";

type NonMoveRow = { nonMoveReasons?: string[] };

function isNonMoveRow(value: unknown): value is NonMoveRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reasons = (value as Record<string, unknown>).nonMoveReasons;
  return reasons === undefined || (Array.isArray(reasons) && reasons.every(reason => typeof reason === "string"));
}

const root = mkdtempSync(join(tmpdir(), "alpha-pon-knowledge-review-input-"));
try {
  const path = join(root, "company_non_move_history.jsonl");
  writeFileSync(
    path,
    [
      JSON.stringify({ nonMoveReasons: ["already_priced_in"] }),
      JSON.stringify({ nonMoveReasons: "broken" }),
      "null",
      "{malformed json row",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = readKnowledgeReviewJsonl<NonMoveRow>(path, isNonMoveRow);
  assert.deepEqual(result.rows, [{ nonMoveReasons: ["already_priced_in"] }]);
  assert.match(result.warning ?? "", /invalid_shape 2/);
  assert.match(result.warning ?? "", /malformed/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("knowledge-review-input.test.ts passed");
