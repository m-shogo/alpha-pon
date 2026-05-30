import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

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
  const date = todayJst();
  const nonMoveRows = readJsonl<NonMoveHistory>("data/company_non_move_history.jsonl");
  const reasonCounts = countReasons(nonMoveRows);
  const regime = readText("reports/regime_scenarios_latest.md");
  const stockPro = readText("reports/stock_pro_agent_latest.md");
  const sourceHealth = readText("reports/source_health_latest.md");
  const companyNetwork = readText("config/company-network.yml");
  const companyHypotheses = readText("config/company-hypotheses.yml");
  const currentRegime = readText("config/current-regime.yml");

  const lines: string[] = [];
  lines.push("# alpha-pon 年次 知識蓄積レビュー");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> 年次レビューは、相場の時代認識・具体銘柄DB・外れ理由DB・禁止ルールを棚卸しするためのレポートです。買い推奨ではありません。");
  lines.push("");

  lines.push("## 生成物チェック");
  lines.push("");
  lines.push(`- regime_scenarios_latest.md: ${regime ? "✅" : "⚠️ missing"}`);
  lines.push(`- stock_pro_agent_latest.md: ${stockPro ? "✅" : "⚠️ missing"}`);
  lines.push(`- source_health_latest.md: ${sourceHealth ? "✅" : "⚠️ missing"}`);
  lines.push(`- company-network.yml: ${companyNetwork ? "✅" : "⚠️ missing"}`);
  lines.push(`- company-hypotheses.yml: ${companyHypotheses ? "✅" : "⚠️ missing"}`);
  lines.push(`- current-regime.yml: ${currentRegime ? "✅" : "⚠️ missing"}`);
  lines.push(`- company_non_move_history rows: ${nonMoveRows.length}`);
  lines.push("");

  lines.push("## 年間の外れ理由トップ");
  lines.push("");
  if (reasonCounts.length === 0) {
    lines.push("- まだ実データが少ないです。外れた仮説は data/company_non_move_history.jsonl に保存してください。");
  } else {
    for (const [reason, count] of reasonCounts.slice(0, 30)) {
      lines.push(`- ${count}件: ${reason}`);
    }
  }
  lines.push("");

  lines.push("## 年次で必ず見ること");
  lines.push("");
  lines.push("- 今年の主役テーマと、来年も残すテーマを分ける");
  lines.push("- 古くなった銘柄仮説を stale / retired にする");
  lines.push("- 今年の外れ理由トップから、来年の禁止ルールを作る");
  lines.push("- 時代シナリオDBを全面棚卸しする");
  lines.push("- 具体銘柄が不要な局面で、無理に銘柄化していなかったか確認する");
  lines.push("- 親会社/関連会社/競合の方が本命だったテーマを洗い出す");
  lines.push("- 長期で使うDBと、短期ノイズDBを分ける");
  lines.push("");

  lines.push("## 年次DBメンテ候補");
  lines.push("");
  lines.push("- current-regime.yml の activeRegimes を見直す");
  lines.push("- regime-scenarios.yml に新しい時代変化を追加する");
  lines.push("- company-hypotheses.yml の lastReviewedAt が古い銘柄を stale にする");
  lines.push("- company-network.yml の関連会社が古くないか確認する");
  lines.push("- non-move-reasons.yml に今年多かった外れ方を追加する");
  lines.push("- stock-pro-agents.yml のエージェント観点を追加/削除する");
  lines.push("");

  lines.push("## 俺からの年次アドバイス");
  lines.push("");
  lines.push("- 今年うまくいったテーマほど、来年は織り込み済みを疑う");
  lines.push("- 今年外したテーマは、テーマが間違いか、銘柄が間違いか、タイミングが間違いかを分ける");
  lines.push("- 1社に執着せず、同テーマの勝ち銘柄・負け銘柄を横比較する");
  lines.push("- 長期投資では、強いテーマより強い財務品質を優先する");
  lines.push("- 相場環境が変わったら、去年の勝ちルールを一度疑う");
  lines.push("");

  lines.push("---");
  lines.push(`*alpha-pon yearly knowledge review | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "knowledge_review_yearly_latest.md"), lines.join("\n"), "utf-8");
  console.log(`yearly knowledge review: ${date}`);
}

main();
