import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { normalizeCurrentDatedReportText } from "./current-dated-report.js";
import { readReadOnlyTextFile } from "./read-only-text-file.js";
import {
  countCompanyCoverageWarnings,
  countOnboardingUnknownThinEvidence,
} from "./stock-pro-improvement-roadmap-input.js";

function readCurrentText(path: string, date: string): string {
  const text = readReadOnlyTextFile(path);
  return text ? normalizeCurrentDatedReportText(text, date) : "";
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
  const inputPaths = {
    quality: "reports/stock_pro_quality_audit_latest.md",
    onboarding: "reports/company_onboarding_audit_latest.md",
    coverage: "reports/company_coverage_audit_latest.md",
    alignment: "reports/regime_hypothesis_alignment_latest.md",
    stale: "reports/stale_hypotheses_latest.md",
  } as const;
  const quality = readCurrentText(inputPaths.quality, date);
  const onboarding = readCurrentText(inputPaths.onboarding, date);
  const coverage = readCurrentText(inputPaths.coverage, date);
  const alignment = readCurrentText(inputPaths.alignment, date);
  const stale = readCurrentText(inputPaths.stale, date);
  const onboardingEvidence = countOnboardingUnknownThinEvidence(onboarding);
  const coverageEvidence = countCompanyCoverageWarnings(coverage);
  const unavailableCurrentInputs = new Set(
    Object.entries({ quality, onboarding, coverage, alignment, stale })
      .filter(([, text]) => !text)
      .map(([key]) => inputPaths[key as keyof typeof inputPaths]),
  );
  if (onboarding && !onboardingEvidence.valid) unavailableCurrentInputs.add(inputPaths.onboarding);
  if (coverage && !coverageEvidence.valid) unavailableCurrentInputs.add(inputPaths.coverage);

  const blocked = count(quality, /\| blocked \|/g);
  const provisional = count(quality, /\| provisional \|/g);
  const covered = count(quality, /\| covered \|/g);
  const unknownThin = onboardingEvidence.valid ? onboardingEvidence.count : 0;
  const networkMissing = coverageEvidence.valid ? coverageEvidence.count : 0;
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
  lines.push(`- unavailable current inputs: ${unavailableCurrentInputs.size}`);
  for (const path of unavailableCurrentInputs) lines.push(`  - ${path}`);
  lines.push("");

  lines.push("## priority improvements");
  lines.push("");
  if (unavailableCurrentInputs.size > 0) {
    lines.push("### S: current audit inputs unavailable");
    lines.push("- 当日生成されていない監査レポートを前日の正常値で代用しない");
    lines.push("- upstream optional stepを確認し、当日レポートを再生成してから品質ロードマップを読む");
    lines.push("");
  }
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