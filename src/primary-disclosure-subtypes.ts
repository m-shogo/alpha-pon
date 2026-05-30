import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

type PrimaryItem = {
  source: string;
  title: string;
  category: string;
  severity: string;
  publishedAt: string;
};

type ScoreLogEntry = {
  code: string;
  name: string;
  primaryDisclosureReview?: {
    decision?: string;
    items?: PrimaryItem[];
  };
};

type Subtype = {
  subtype: string;
  severityHint: "positive" | "neutral" | "caution" | "blocker";
  reason: string;
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

function has(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}

function classifySubtype(item: PrimaryItem): Subtype {
  const text = item.title;

  if (item.category === "buyback") {
    if (has(text, ["消却", "自己株式の消却"])) return { subtype: "buyback_with_cancellation", severityHint: "positive", reason: "自社株買いに消却を伴う可能性" };
    if (has(text, ["取得状況", "取得結果"])) return { subtype: "buyback_progress", severityHint: "neutral", reason: "自社株買いの進捗/結果" };
    return { subtype: "buyback_general", severityHint: "positive", reason: "自社株買い関連" };
  }

  if (item.category === "downward_revision") {
    if (has(text, ["減損", "特別損失"])) return { subtype: "downward_revision_impairment", severityHint: "blocker", reason: "減損/特損を伴う下方修正" };
    if (has(text, ["赤字", "営業損失"])) return { subtype: "downward_revision_loss", severityHint: "blocker", reason: "赤字/営業損失を伴う可能性" };
    if (has(text, ["配当", "減配"])) return { subtype: "downward_revision_dividend", severityHint: "caution", reason: "配当修正/減配を伴う可能性" };
    return { subtype: "downward_revision_general", severityHint: "caution", reason: "業績予想下方修正系" };
  }

  if (item.category === "share_issuance") {
    if (has(text, ["MSワラント", "行使価額修正"])) return { subtype: "share_issuance_moving_strike", severityHint: "blocker", reason: "行使価額修正型で希薄化リスクが高い" };
    if (has(text, ["新株予約権"])) return { subtype: "share_issuance_warrant", severityHint: "caution", reason: "新株予約権による希薄化確認が必要" };
    if (has(text, ["公募", "売出し"])) return { subtype: "share_issuance_public_offering", severityHint: "caution", reason: "公募/売出しによる需給悪化確認が必要" };
    if (has(text, ["第三者割当"])) return { subtype: "share_issuance_third_party", severityHint: "caution", reason: "第三者割当の目的と希薄化確認が必要" };
    return { subtype: "share_issuance_general", severityHint: "caution", reason: "増資/希薄化系" };
  }

  if (item.category === "scandal") {
    if (has(text, ["粉飾", "過年度", "訂正報告書"])) return { subtype: "scandal_accounting", severityHint: "blocker", reason: "会計不祥事/過年度訂正の可能性" };
    if (has(text, ["情報漏えい", "サイバー"])) return { subtype: "scandal_security", severityHint: "caution", reason: "情報漏えい/サイバー事故" };
    if (has(text, ["行政処分", "処分"])) return { subtype: "scandal_regulatory", severityHint: "blocker", reason: "行政処分/規制リスク" };
    return { subtype: "scandal_general", severityHint: "blocker", reason: "不祥事系" };
  }

  if (item.category === "ma") {
    if (has(text, ["TOB", "公開買付"])) return { subtype: "ma_tob", severityHint: "positive", reason: "TOB/公開買付" };
    if (has(text, ["子会社化", "株式取得"])) return { subtype: "ma_acquisition", severityHint: "neutral", reason: "買収/子会社化" };
    if (has(text, ["譲渡", "売却"])) return { subtype: "ma_divestiture", severityHint: "caution", reason: "事業/株式譲渡" };
    return { subtype: "ma_general", severityHint: "neutral", reason: "M&A関連" };
  }

  if (item.category === "dividend") {
    if (has(text, ["増配"])) return { subtype: "dividend_increase", severityHint: "positive", reason: "増配" };
    if (has(text, ["減配", "無配"])) return { subtype: "dividend_cut", severityHint: "caution", reason: "減配/無配" };
    return { subtype: "dividend_general", severityHint: "neutral", reason: "配当関連" };
  }

  return { subtype: `${item.category}_general`, severityHint: item.severity as Subtype["severityHint"] ?? "neutral", reason: "カテゴリ一般" };
}

function main() {
  const date = todayJst();
  const scores = readScores();
  const rows: Array<{ code: string; name: string; title: string; category: string; severity: string; subtype: Subtype }> = [];

  for (const score of scores) {
    for (const item of score.primaryDisclosureReview?.items ?? []) {
      rows.push({
        code: score.code,
        name: score.name,
        title: item.title,
        category: item.category,
        severity: item.severity,
        subtype: classifySubtype(item),
      });
    }
  }

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.subtype.subtype, (counts.get(row.subtype.subtype) ?? 0) + 1);

  const lines: string[] = [];
  lines.push("# alpha-pon 一次情報サブタイプ分類レポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> TDnet/EDINETタイトルから、一次情報カテゴリをさらに細かいサブタイプに分けます。買い推奨ではなく、誤判定防止と学習改善用です。");
  lines.push("");
  lines.push("## サブタイプ出現数");
  lines.push("");
  for (const [key, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${count}件: ${key}`);
  }
  if (counts.size === 0) lines.push("- まだ一次情報サブタイプ対象のログがありません。");
  lines.push("");

  lines.push("## 明細");
  lines.push("");
  lines.push("| code | name | category | severity | subtype | hint | title |");
  lines.push("|------|------|----------|----------|---------|------|-------|");
  for (const row of rows.slice(0, 100)) {
    lines.push(`| ${row.code} | ${row.name} | ${row.category} | ${row.severity} | ${row.subtype.subtype} | ${row.subtype.severityHint} | ${row.title.replace(/\|/g, " ")} |`);
  }
  if (rows.length === 0) lines.push("| no_data | no_data | no_data | no_data | no_data | no_data | no_data |");
  lines.push("");

  lines.push("## 運用ルール");
  lines.push("");
  lines.push("- share_issuance_moving_strike は原則block寄りに扱う");
  lines.push("- downward_revision_impairment / loss は必ず本文確認する");
  lines.push("- buyback_with_cancellation はポジティブ材料だが、株価織り込みと規模確認が必要");
  lines.push("- ma_tob は需給イベントであり、長期投資候補とは分けて扱う");
  lines.push("- タイトル分類だけで確定しない。本文PDF確認が前提");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon primary disclosure subtypes | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "primary_disclosure_subtypes_latest.md"), lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "primary_disclosure_subtypes_latest.json"), JSON.stringify(rows, null, 2), "utf-8");
  console.log(`primary disclosure subtype rows: ${rows.length}`);
}

main();
