// pnpm audit:outcomes — 仮説レビュー品質監査 v1
// 生成済みの hypotheses.json / outcomes.json を読み、答え合わせの品質を監査する。
// 出力:
//   reports/outcome-quality-audit.md
//   reports/outcome-quality-audit.json
// ops dashboard（pnpm report:ops）がこの JSON を読んで /ops に統合する。
// このスクリプトは読み取り + レポート出力のみで、データを書き換えない。

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getTodayInTokyo } from "./jobs/date-utils.js";
import {
  buildOutcomeQualityAudit,
  renderOutcomeQualityMarkdown,
  type QualityHypothesisLike,
  type QualityOutcomeLike,
} from "./outcome-quality-audit.js";
import {
  isQualityHypothesisLikeAsOf,
  isQualityOutcomeLikeAsOf,
} from "./outcome-quality-audit-input.js";

const ROOT = process.cwd();

function readJson<T>(path: string): T | null {
  const full = join(ROOT, path);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, "utf-8")) as T;
  } catch {
    return null;
  }
}

const hypothesesFile = readJson<{ hypotheses?: unknown[] }>(
  "apps/web/public/generated/hypotheses.json"
);
const outcomesFile = readJson<{ outcomes?: unknown[] }>(
  "apps/web/public/generated/outcomes.json"
);

const hypotheses = hypothesesFile?.hypotheses;
const outcomes = outcomesFile?.outcomes;
if (!Array.isArray(hypotheses) || !Array.isArray(outcomes)) {
  console.error(
    "生成データのshapeが不正です。先に pnpm ui:data を再実行してください。" +
      `（hypotheses.json: ${Array.isArray(hypotheses) ? "ok" : "invalid"} / outcomes.json: ${Array.isArray(outcomes) ? "ok" : "invalid"}）`
  );
  process.exit(1);
}

const today = getTodayInTokyo();
const hypothesisRowsOk = hypotheses.every(row => isQualityHypothesisLikeAsOf(row, today));
const outcomeRowsOk = outcomes.every(row => isQualityOutcomeLikeAsOf(row, today));
if (!hypothesisRowsOk || !outcomeRowsOk) {
  console.error(
    "生成データのrow shapeまたはPIT cutoffが不正です。先に pnpm ui:data を再実行してください。" +
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
