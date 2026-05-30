import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

type Mode = "weekly" | "monthly";

type NonMoveHistory = {
  date?: string;
  code?: string;
  name?: string;
  category?: string;
  hypothesis?: string;
  outcome?: string;
  nonMoveReasons?: string[];
  lesson?: string;
  nextAction?: string;
};

function readText(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((item): item is T => item !== null);
}

function countReasons(rows: NonMoveHistory[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const reason of row.nonMoveReasons ?? []) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function main() {
  const mode: Mode = process.argv.includes("--monthly") ? "monthly" : "weekly";
  const date = todayJst();
  const nonMoveRows = readJsonl<NonMoveHistory>("data/company_non_move_history.jsonl");
  const reasonCounts = countReasons(nonMoveRows);
  const regime = readText("reports/regime_scenarios_latest.md");
  const stockPro = readText("reports/stock_pro_agent_latest.md");
  const proposals = readText("reports/proposals_latest.md");
  const sourceHealth = readText("reports/source_health_latest.md");

  const lines: string[] = [];
  lines.push(`# alpha-pon ${mode === "monthly" ? "月次" : "週次"} 知識蓄積レビュー`);
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> 情勢・株Pro考察・上がらなかった理由・source health をまとめて、DBがメモで終わらず運用に使われているか確認します。買い推奨ではありません。");
  lines.push("");

  lines.push("## 生成物チェック");
  lines.push("");
  lines.push(`- regime_scenarios_latest.md: ${regime ? "✅" : "⚠️ missing"}`);
  lines.push(`- stock_pro_agent_latest.md: ${stockPro ? "✅" : "⚠️ missing"}`);
  lines.push(`- proposals_latest.md: ${proposals ? "✅" : "⚠️ missing"}`);
  lines.push(`- source_health_latest.md: ${sourceHealth ? "✅" : "⚠️ missing"}`);
  lines.push(`- company_non_move_history rows: ${nonMoveRows.length}`);
  lines.push("");

  lines.push("## 上がらなかった理由DB 集計");
  lines.push("");
  if (reasonCounts.length === 0) {
    lines.push("- まだ実データが少ないです。外れた仮説は data/company_non_move_history.jsonl に保存してください。");
  } else {
    for (const [reason, count] of reasonCounts.slice(0, 20)) {
      lines.push(`- ${count}件: ${reason}`);
    }
  }
  lines.push("");

  lines.push("## 今週/月の確認観点");
  lines.push("");
  lines.push("- 情勢DBと実際のニュースカテゴリがズレていないか");
  lines.push("- stock pro agent が具体銘柄ごとに良い/悪い/上がらない理由を出しているか");
  lines.push("- 親会社/関連会社/競合の方が本命だったケースがないか");
  lines.push("- 上がらなかった理由が unknown で放置されていないか");
  lines.push("- source health 欠損が続いて、考察の質を落としていないか");
  lines.push("- 具体銘柄が不要な局面で、無理に銘柄化していないか");
  lines.push("");

  lines.push("## 次にDB化する候補");
  lines.push("");
  lines.push("- 業種別ベンチマーク");
  lines.push("- PER/PBR過去レンジ");
  lines.push("- セグメント別売上・利益比率");
  lines.push("- 決算期・イベントカレンダー");
  lines.push("- source health履歴");
  lines.push("- regime履歴");
  lines.push("");

  lines.push("## 運用ルール");
  lines.push("");
  lines.push("- 週次では、外れ理由と具体銘柄仮説の修正を優先する");
  lines.push("- 月次では、時代シナリオ・カテゴリ・代表銘柄DBの入れ替えを検討する");
  lines.push("- 買い推奨ではなく、調査候補・保留・避ける・証拠不足で管理する");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon knowledge review | ${mode} | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `knowledge_review_${mode}_latest.md`), lines.join("\n"), "utf-8");
  console.log(`knowledge review ${mode}: ${date}`);
}

main();
