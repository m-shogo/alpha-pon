import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

type Check = {
  persona: string;
  item: string;
  path: string;
  ok: boolean;
  action: string;
};

const checks: Check[] = [
  { persona: "毎朝見る自分", item: "pipeline status", path: "reports/pipeline_status_latest.json", ok: existsSync("reports/pipeline_status_latest.json"), action: "run-daily.sh の実行状態を確認する" },
  { persona: "データ運用者", item: "source health", path: "reports/source_health_latest.md", ok: existsSync("reports/source_health_latest.md"), action: "health:sources を実行する" },
  { persona: "改善担当", item: "proposals", path: "reports/proposals_latest.md", ok: existsSync("reports/proposals_latest.md"), action: "src/proposals.ts を実行する" },
  { persona: "改善担当", item: "proposal streaks", path: "reports/proposal_streaks_latest.json", ok: existsSync("reports/proposal_streaks_latest.json"), action: "scripts/run-proposal-history.sh を実行する" },
  { persona: "検証・学習担当", item: "learning report", path: "reports/learning_latest.md", ok: existsSync("reports/learning_latest.md"), action: "src/learn.ts を実行する" },
  { persona: "一次情報管理者", item: "primary disclosure learning", path: "reports/primary_disclosure_learning_latest.md", ok: existsSync("reports/primary_disclosure_learning_latest.md"), action: "src/primary-disclosure-learning.ts を実行する" },
  { persona: "一次情報管理者", item: "primary disclosure category learning", path: "reports/primary_disclosure_category_learning_latest.md", ok: existsSync("reports/primary_disclosure_category_learning_latest.md"), action: "src/primary-disclosure-category-learning.ts を実行する" },
  { persona: "ルール管理者", item: "rule diagnostics", path: "reports/rule_diagnostics_latest.md", ok: existsSync("reports/rule_diagnostics_latest.md"), action: "src/rule-diagnostics.ts を実行する" },
  { persona: "銘柄記憶担当", item: "company memory", path: "reports/company_memory_latest.md", ok: existsSync("reports/company_memory_latest.md"), action: "src/update-company-memory.ts を実行する" },
];

function main() {
  const date = todayJst();
  const missing = checks.filter(check => !check.ok);
  const byPersona = new Map<string, Check[]>();
  for (const check of checks) {
    if (!byPersona.has(check.persona)) byPersona.set(check.persona, []);
    byPersona.get(check.persona)!.push(check);
  }

  const lines: string[] = [];
  lines.push("# alpha-pon ペルソナ監査レポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> ペルソナ別に、必要な運用レポートが揃っているか確認します。買い推奨ではありません。");
  lines.push("");
  lines.push(`- total checks: ${checks.length}`);
  lines.push(`- missing: ${missing.length}`);
  lines.push("");

  for (const [persona, rows] of byPersona.entries()) {
    lines.push(`## ${persona}`);
    lines.push("");
    for (const row of rows) {
      lines.push(`- ${row.ok ? "✅" : "⚠️"} ${row.item}: ${row.path}`);
      if (!row.ok) lines.push(`  - action: ${row.action}`);
    }
    lines.push("");
  }

  if (missing.length > 0) {
    lines.push("## 次に埋める穴");
    lines.push("");
    for (const row of missing) lines.push(`- ${row.persona}: ${row.item} → ${row.action}`);
    lines.push("");
  }

  lines.push("## 運用ルール");
  lines.push("");
  lines.push("- missingがある日は、候補判断より先にレポート生成・データ取得を確認する");
  lines.push("- proposal streaks がない日は、継続課題を見落とす可能性がある");
  lines.push("- daily本体が失敗している日は、他のレポートがあっても候補判断には使わない");
  lines.push("- この監査は買い推奨ではなく、運用品質の確認に使う");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon persona audit | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "persona_audit_latest.md"), lines.join("\n"), "utf-8");
  console.log(`persona audit missing=${missing.length}`);
}

main();
