import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function extractBlockedCompanies(text: string): string[] {
  return text
    .split("\n")
    .filter(line => line.startsWith("| blocked |"))
    .map(line => line.split("|").map(cell => cell.trim()))
    .map(cells => `${cells[2]} ${cells[3]}`)
    .filter(Boolean)
    .slice(0, 20);
}

function main() {
  const date = todayJst();
  const quality = readText("reports/stock_pro_quality_audit_latest.md");
  const onboarding = readText("reports/company_onboarding_audit_latest.md");
  const coverage = readText("reports/company_coverage_audit_latest.md");
  const alignment = readText("reports/regime_hypothesis_alignment_latest.md");
  const stale = readText("reports/stale_hypotheses_latest.md");

  const blocked = count(quality, /\| blocked \|/g);
  const provisional = count(quality, /\| provisional \|/g);
  const covered = count(quality, /\| covered \|/g);
  const unknownThin = count(onboarding, /unknown_or_thin/g);
  const networkMissing = count(coverage, /hypothesis missing network|network missing hypothesis|missing/g);
  const regimeMismatch = count(alignment, /監視対象外|current regime 外|active but thin/g);
  const staleWarnings = count(stale, /review_needed|retire_or_rewrite|review_repeated_miss|missing_review_date/g);
  const blockedCompanies = extractBlockedCompanies(quality);

  const lines: string[] = [];
  lines.push("# alpha-pon stock pro improvement roadmap");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("目的: 株Proアプリとして精度を上げるために、次に埋める情報を優先順位化します。買い推奨ではありません。");
  lines.push("");
  lines.push("## current quality snapshot");
  lines.push("");
  lines.push(`- covered: ${covered}`);
  lines.push(`- provisional: ${provisional}`);
  lines.push(`- blocked: ${blocked}`);
  lines.push(`- onboarding unknown_or_thin: ${unknownThin}`);
  lines.push(`- network coverage warnings: ${networkMissing}`);
  lines.push(`- regime mismatch warnings: ${regimeMismatch}`);
  lines.push(`- stale/review warnings: ${staleWarnings}`);
  lines.push("");

  lines.push("## priority improvements");
  lines.push("");
  if (blocked > 0 || unknownThin > 0) {
    lines.push("### S: 初回銘柄調査の不足を潰す");
    lines.push("- 公式IRページ、決算日、株主総会/招集通知/議案、配当/資本政策を最優先で埋める");
    lines.push("- 知らない銘柄は、まずunknown/provisional扱いにして、強い結論を出さない");
    lines.push("- 総会/決算/配当が近い銘柄は、テーマよりイベント確認を優先する");
    lines.push("");
  }
  if (networkMissing > 0) {
    lines.push("### A: 会社ネットワークを補完する");
    lines.push("- 競合、親会社、子会社、関連会社、better peer riskを埋める");
    lines.push("- テーマが正しくても本命銘柄が別、というミスを減らす");
    lines.push("");
  }
  if (regimeMismatch > 0) {
    lines.push("### A: 社会情勢とのズレを直す");
    lines.push("- current-regime外の銘柄を追いすぎていないか確認する");
    lines.push("- active regimeなのに銘柄仮説が薄いカテゴリは、無理に銘柄化せずテーマ監視へ置く");
    lines.push("");
  }
  if (staleWarnings > 0) {
    lines.push("### B: 古い仮説を整理する");
    lines.push("- review_needed / repeated_miss の銘柄は、仮説を書き換えるか退役候補にする");
    lines.push("- 外れ理由が繰り返される銘柄は、銘柄が悪いのか、テーマが悪いのか、タイミングが悪いのか分ける");
    lines.push("");
  }

  lines.push("## next data to collect");
  lines.push("");
  lines.push("1. 直近IRイベント: 決算日、総会日、招集通知、議案、配当、資本政策");
  lines.push("2. バリュエーション: PER/PBR過去レンジ、同業比較、期待先行判定");
  lines.push("3. 財務品質: ROIC、FCF、営業利益率、自己資本比率、セグメント利益");
  lines.push("4. 会社ネットワーク: 競合、親会社/子会社、better peer risk");
  lines.push("5. 外れ理由: 上がらなかった理由、決算後反応、材料出尽くし");
  lines.push("");

  lines.push("## blocked/provisional sample targets");
  lines.push("");
  if (blockedCompanies.length === 0) lines.push("- N/A");
  else blockedCompanies.forEach(company => lines.push(`- ${company}`));
  lines.push("");

  lines.push("## operating stance");
  lines.push("");
  lines.push("- 良いものを作るため、足りない項目は責めずに改善キューへ入れる");
  lines.push("- 断言より、反証と不足を先に出す");
  lines.push("- 銘柄を増やすより、1銘柄あたりの一次情報・イベント・競合・外れ理由の厚みを優先する");
  lines.push("- 精度は予測の派手さではなく、見落としを減らすことで上げる");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "stock_pro_improvement_roadmap_latest.md"), lines.join("\n"), "utf-8");
  console.log("stock pro improvement roadmap generated");
}

main();
