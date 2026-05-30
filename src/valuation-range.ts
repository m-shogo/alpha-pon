import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

type MarketContext = {
  return5d?: number | null;
  return20d?: number | null;
  return60d?: number | null;
  relativeToTopix20d?: number | null;
  liquidityYen20d?: number | null;
  volatility20d?: number | null;
};

type FinancialQuality = {
  roic?: number | null;
  roe?: number | null;
  fcfMargin?: number | null;
  operatingMargin?: number | null;
  equityRatio?: number | null;
  moatScore?: number;
  qualityScore?: number;
};

type ScoreLogEntry = {
  code: string;
  name: string;
  score: number;
  alertLevel: string;
  rules?: string[];
  tags?: string[];
  marketContext?: MarketContext;
  financialQuality?: FinancialQuality;
  warnings?: string[];
};

function latestScoreFile(): string | null {
  if (!existsSync("reports")) return null;
  const files = readdirSync("reports")
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
  return files.at(-1) ? join("reports", files.at(-1)!) : null;
}

function readScores(): ScoreLogEntry[] {
  const path = latestScoreFile();
  if (!path) return [];
  try {
    const value = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return Array.isArray(value) ? value as ScoreLogEntry[] : [];
  } catch {
    return [];
  }
}

function fmt(value: number | null | undefined, suffix = "%"): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function valuationBand(entry: ScoreLogEntry): { band: string; reasons: string[] } {
  const reasons: string[] = [];
  const m = entry.marketContext;
  const f = entry.financialQuality;
  const drawdownProxy = m?.return60d ?? null;
  const relative = m?.relativeToTopix20d ?? null;
  const quality = f?.qualityScore ?? 0;
  const moat = f?.moatScore ?? 0;

  if (drawdownProxy != null && drawdownProxy <= -20) reasons.push("60日リターンが大きく下落");
  if (relative != null && relative <= -10) reasons.push("TOPIX比で弱い");
  if (quality >= 10 || moat >= 7) reasons.push("財務品質/競争優位が比較的強い");
  if ((f?.roic ?? 0) >= 8) reasons.push("ROICが一定以上");
  if ((f?.fcfMargin ?? -999) >= 5) reasons.push("FCFマージンがプラス圏");

  if ((quality >= 10 || moat >= 7) && drawdownProxy != null && drawdownProxy <= -15) {
    return { band: "quality_pullback", reasons };
  }
  if (drawdownProxy != null && drawdownProxy >= 30) {
    return { band: "possibly_overheated", reasons: [...reasons, "60日で大きく上昇"] };
  }
  if (quality < 5 && drawdownProxy != null && drawdownProxy <= -20) {
    return { band: "falling_low_quality", reasons: [...reasons, "品質スコアが低く下落理由の確認が必要"] };
  }
  return { band: "neutral_or_insufficient", reasons };
}

function main() {
  const date = todayJst();
  const scores = readScores();
  const lines: string[] = [];
  lines.push("# alpha-pon バリュエーション過去レンジ補助レポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> PER/PBRの厳密な過去レンジではなく、現時点で取れている株価レンジ・相対リターン・財務品質から、調査優先度を補助的に見るレポートです。買い推奨ではありません。");
  lines.push("");
  lines.push("| code | name | band | score | 60d | relTopix20d | ROIC | FCF margin | moat | quality | notes |");
  lines.push("|------|------|------|-------|-----|------------|------|------------|------|---------|-------|");

  const rows = scores.map(entry => ({ entry, band: valuationBand(entry) }));
  for (const row of rows) {
    const e = row.entry;
    const m = e.marketContext;
    const f = e.financialQuality;
    lines.push(`| ${e.code} | ${e.name} | ${row.band.band} | ${e.score} | ${fmt(m?.return60d)} | ${fmt(m?.relativeToTopix20d)} | ${fmt(f?.roic)} | ${fmt(f?.fcfMargin)} | ${f?.moatScore ?? "N/A"} | ${f?.qualityScore ?? "N/A"} | ${row.band.reasons.join(" / ") || "N/A"} |`);
  }

  lines.push("");
  lines.push("## 運用ルール");
  lines.push("");
  lines.push("- quality_pullback は調査候補。買い推奨ではなく、決算・一次情報・業績悪化理由を確認する");
  lines.push("- possibly_overheated はFOMO注意。即通知ではなくログ優先");
  lines.push("- falling_low_quality は安いだけの可能性があるため慎重に扱う");
  lines.push("- 厳密なPER/PBR過去レンジは、将来J-Quantsまたは別データで取得できる場合に拡張する");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon valuation range | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "valuation_range_latest.md"), lines.join("\n"), "utf-8");
  console.log(`valuation rows: ${scores.length}`);
}

main();
