// pnpm audit:outcomes — 仮説レビュー品質監査 v1
// 生成済みの hypotheses.json / outcomes.json を読み、答え合わせの品質を監査する。
// 出力:
//   reports/outcome-quality-audit.md
//   reports/outcome-quality-audit.json
// ops dashboard（pnpm report:ops）がこの JSON を読んで /ops に統合する。
// このスクリプトは読み取り + レポート出力のみで、データを書き換えない。

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getTodayInTokyo } from "./jobs/date-utils.js";
import {
  buildOutcomeQualityAudit,
  renderOutcomeQualityMarkdown,
  type QualityHypothesisLike,
  type QualityOutcomeLike,
} from "./outcome-quality-audit.js";
import {
  hasUniqueQualityOutcomeIdentitiesAsOf,
  isQualityHypothesisLikeAsOf,
} from "./outcome-quality-audit-input.js";
import { readReadOnlyJsonObjectArrayFile } from "./read-only-json-file.js";

const ROOT = process.cwd();

function readGeneratedRows(path: string, field: string): unknown[] | null {
  const loaded = readReadOnlyJsonObjectArrayFile<unknown>(join(ROOT, path), field);
  if (loaded.missing || loaded.parseError || loaded.invalidRoot || loaded.invalidField) return null;
  return loaded.rows;
}

const hypotheses = readGeneratedRows(
  "apps/web/public/generated/hypotheses.json",
  "hypotheses",
);
const outcomes = readGeneratedRows(
  "apps/web/public/generated/outcomes.json",
  "outcomes",
);

if (!hypotheses || !outcomes) {
  console.error(
    "生成データのshapeまたはcanonical file boundaryが不正です。先に pnpm ui:data を再実行してください。" +
      `（hypotheses.json: ${hypotheses ? "ok" : "invalid"} / outcomes.json: ${outcomes ? "ok" : "invalid"}）`
  );
  process.exit(1);
}

const today = getTodayInTokyo();
const hypothesisRowsOk = hypotheses.every(row => isQualityHypothesisLikeAsOf(row, today));
const outcomeRowsOk = hasUniqueQualityOutcomeIdentitiesAsOf(outcomes, today);
if (!hypothesisRowsOk || !outcomeRowsOk) {
  console.error(
    "生成データのrow shape・PIT cutoff・Outcome identityが不正です。先に pnpm ui:data を再実行してください。" +
      `（hypotheses rows: ${hypothesisRowsOk ? "ok" : "invalid"} / outcomes rows: ${outcomeRowsOk ? "ok" : "invalid"}）`
  );
  process.exit(1);
}

const audit = buildOutcomeQualityAudit({
  today,
  hypotheses: hypotheses as QualityHypothesisLike[],
  outcomes: outcomes as QualityOutcomeLike[],
});

mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports/outcome-quality-audit.json"), JSON.stringify(audit, null, 2) + "\n");
writeFileSync(join(ROOT, "reports/outcome-quality-audit.md"), renderOutcomeQualityMarkdown(audit));

console.log(`\n=== 仮説レビュー品質監査 (${audit.generatedAt}) ===\n`);
console.log(`healthStatus: ${audit.healthStatus}`);
console.log(`仮説: ${audit.totals.hypotheses}件 / outcome: ${audit.totals.outcomes}件 / グループ: ${audit.totals.groups}件\n`);
for (const [key, check] of Object.entries(audit.checks)) {
  const marker = check.count === 0 ? "✓" : "△";
  console.log(`  ${marker} ${key}: ${check.count}件`);
}
console.log("\n出力: reports/outcome-quality-audit.md / reports/outcome-quality-audit.json");
