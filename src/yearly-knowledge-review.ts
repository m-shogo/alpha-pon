import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { readKnowledgeReviewJsonl } from "./knowledge-review-input.js";
import { isUsableYearlyRegimeHistory } from "./yearly-knowledge-review-input.js";
import { isUsableYearlySourceHealthHistory } from "./yearly-source-health-history-input.js";

type NonMoveHistory = { date?: string; code?: string; name?: string; category?: string; hypothesis?: string; outcome?: string; nonMoveReasons?: string[]; lesson?: string; nextAction?: string; };
type RegimeHistory = { date?: string; mode?: string; activeRegimes?: Array<{ id?: string; level?: string; watchCategories?: string[] }>; };
type SourceHealthHistory = { date?: string; reports?: Record<string, { exists?: boolean; size?: number }>; };

function isNonMoveHistory(value: unknown): value is NonMoveHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reasons = (value as Record<string, unknown>).nonMoveReasons;
  return reasons === undefined || (Array.isArray(reasons) && reasons.every(reason => typeof reason === "string"));
}
function isRegimeHistory(value: unknown): value is RegimeHistory { return isUsableYearlyRegimeHistory(value); }
function isSourceHealthHistory(value: unknown): value is SourceHealthHistory { return isUsableYearlySourceHealthHistory(value); }
function readText(path: string): string { if (!existsSync(path)) return ""; return readFileSync(path, "utf-8"); }
function countReasons(rows: NonMoveHistory[]): Array<[string, number]> { const counts = new Map<string, number>(); for (const row of rows) for (const reason of row.nonMoveReasons ?? []) counts.set(reason, (counts.get(reason) ?? 0) + 1); return [...counts.entries()].sort((a,b)=>b[1]-a[1]); }
function countRegimes(rows: RegimeHistory[]): Array<[string, number]> { const counts = new Map<string, number>(); for (const row of rows) for (const regime of row.activeRegimes ?? []) { const id=regime.id ?? "unknown"; counts.set(id,(counts.get(id)??0)+1); } return [...counts.entries()].sort((a,b)=>b[1]-a[1]); }
function countMissingReports(rows: SourceHealthHistory[]): Array<[string, number]> { const counts=new Map<string,number>(); for (const row of rows) for (const [name,value] of Object.entries(row.reports ?? {})) if (!value.exists || (value.size ?? 0)===0) counts.set(name,(counts.get(name)??0)+1); return [...counts.entries()].sort((a,b)=>b[1]-a[1]); }

function main() {
  const date=todayJst();
  const nonMoveInput=readKnowledgeReviewJsonl<NonMoveHistory>("data/company_non_move_history.jsonl",isNonMoveHistory);
  const regimeInput=readKnowledgeReviewJsonl<RegimeHistory>("data/regime_history.jsonl",isRegimeHistory);
  const sourceInput=readKnowledgeReviewJsonl<SourceHealthHistory>("data/source_health_history.jsonl",isSourceHealthHistory);
  const nonMoveRows=nonMoveInput.rows; const regimeRows=regimeInput.rows; const sourceRows=sourceInput.rows;
  const reasonCounts=countReasons(nonMoveRows); const regimeCounts=countRegimes(regimeRows); const missingReports=countMissingReports(sourceRows);
  const regime=readText("reports/regime_scenarios_latest.md"); const stockPro=readText("reports/stock_pro_agent_latest.md"); const sourceHealth=readText("reports/source_health_latest.md");
  const companyNetwork=readText("config/company-network.yml"); const companyHypotheses=readText("config/company-hypotheses.yml"); const currentRegime=readText("config/current-regime.yml"); const strategicAdvice=readText("reports/strategic_advice_latest.md");
  const lines:string[]=[];
  lines.push("# alpha-pon 年次 知識蓄積レビュー","",`生成日: ${date}`,"","> 年次レビューは、時代認識・具体銘柄DB・外れ理由DB・禁止ルールを棚卸しするためのレポートです。買い推奨ではありません。","");
  lines.push("## 生成物チェック","",`- regime_scenarios_latest.md: ${regime ? "✅" : "⚠️ missing"}`,`- stock_pro_agent_latest.md: ${stockPro ? "✅" : "⚠️ missing"}`,`- source_health_latest.md: ${sourceHealth ? "✅" : "⚠️ missing"}`,`- strategic_advice_latest.md: ${strategicAdvice ? "✅" : "⚠️ missing"}`,`- company-network.yml: ${companyNetwork ? "✅" : "⚠️ missing"}`,`- company-hypotheses.yml: ${companyHypotheses ? "✅" : "⚠️ missing"}`,`- current-regime.yml: ${currentRegime ? "✅" : "⚠️ missing"}`,`- company_non_move_history rows: ${nonMoveRows.length}`,`- regime_history rows: ${regimeRows.length}`,`- source_health_history rows: ${sourceRows.length}`);
  for (const warning of [nonMoveInput.warning,regimeInput.warning,sourceInput.warning]) if (warning) lines.push(`- ⚠️ ${warning}`); lines.push("");
  lines.push("## 年間の外れ理由トップ",""); if(reasonCounts.length===0) lines.push("- まだ実データが少ないです。外れた仮説は data/company_non_move_history.jsonl に保存してください。"); else for(const [reason,count] of reasonCounts.slice(0,30)) lines.push(`- ${count}件: ${reason}`); lines.push("");
  lines.push("## 年間の情勢モード偏り",""); if(regimeCounts.length===0) lines.push("- regime履歴がまだ少ないです。年次評価は保留。"); else for(const [id,count] of regimeCounts.slice(0,20)) lines.push(`- ${count}回: ${id}`); lines.push("");
  lines.push("## source health 年間不調",""); if(missingReports.length===0) lines.push("- 記録上、継続的なmissingは目立ちません。"); else for(const [report,count] of missingReports.slice(0,20)) lines.push(`- ${count}回 missing/empty: ${report}`); lines.push("");
  lines.push("## 年次で必ず見ること","","- 今年の主役テーマと、来年も残すテーマを分ける","- 古くなった銘柄仮説を stale / retired にする","- 今年の外れ理由トップから、来年の禁止ルールを作る","- 時代シナリオDBを全面棚卸しする","- 具体銘柄が不要な局面で、無理に銘柄化していなかったか確認する","- 親会社/関連会社/競合の方が本命だったテーマを洗い出す","- 長期で使うDBと、短期ノイズDBを分ける","");
  lines.push("## 年次DBメンテ候補","","- current-regime.yml の activeRegimes を見直す","- regime-scenarios.yml に新しい時代変化を追加する","- company-hypotheses.yml の lastReviewedAt が古い銘柄を stale にする","- company-network.yml の関連会社が古くないか確認する","- non-move-reasons.yml に今年多かった外れ方を追加する","- stock-pro-agents.yml のエージェント観点を追加/削除する","");
  lines.push("## 俺からの年次アドバイス","","- 今年うまくいったテーマほど、来年は織り込み済みを疑う","- 今年外したテーマは、テーマが間違いか、銘柄が間違いか、タイミングが間違いかを分ける","- 1社に執着せず、同テーマの勝ち銘柄・負け銘柄を横比較する","- 長期投資では、強いテーマより強い財務品質を優先する","- 相場環境が変わったら、去年の勝ちルールを一度疑う","","---",`*alpha-pon yearly knowledge review | ${date} | ※買い推奨ではありません*`);
  mkdirSync("reports",{recursive:true}); writeFileSync(join("reports","knowledge_review_yearly_latest.md"),lines.join("\n"),"utf-8"); console.log(`yearly knowledge review: ${date}`);
}
main();
