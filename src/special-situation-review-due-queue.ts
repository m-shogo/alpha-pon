// 特殊状況ウォッチ review due queue
// 特殊状況ウォッチ候補に紐づく outcome の「いつ採点するか」を整理する。
// このCLIはレポート生成のみ。data/hypothesis_outcomes.jsonl は更新しない。
//
// pnpm review:special-due

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { addDaysJst, todayJst } from "./date.js";
import type { HypothesisOutcome, ReviewHorizon } from "./universe.js";
import { isSpecialSituationOutcome, detectMixedOutcomes } from "./special-situation-outcome-filter.js";

const REPORT_DIR = "reports";

// ─────────── 型定義 ───────────

type DueStatus =
  | "due_today"
  | "due_this_week"
  | "overdue"
  | "not_due_yet"
  | "no_outcome_record";

type ReviewDueItem = {
  code: string;
  name: string;
  outcomeKey: string | null;
  horizon: ReviewHorizon;
  detectedAt: string | null;
  dueAt: string | null;
  status: DueStatus;
  missingFields: Array<"result" | "return1w" | "return1m" | "topixRelative1m">;
  nextAction: string;
};

type NoOutcomeRecord = {
  code: string;
  name: string;
  reason: string;
  nextAction: string;
};

type SpecialSituationReviewDueReport = {
  generatedAt: string;
  today: string;
  summary: {
    totalCandidates: number;
    matchedOutcomes: number;
    dueToday: number;
    dueThisWeek: number;
    overdue: number;
    notDueYet: number;
    noOutcomeRecord: number;
  };
  dueToday: ReviewDueItem[];
  dueThisWeek: ReviewDueItem[];
  overdue: ReviewDueItem[];
  notDueYet: ReviewDueItem[];
  noOutcomeRecord: NoOutcomeRecord[];
  notes: string[];
};

// ─────────── ヘルパ ───────────

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => JSON.parse(l) as T);
}

function readYaml<T>(path: string): T {
  return load(readFileSync(path, "utf-8")) as T;
}

const HORIZON_DAYS: Record<ReviewHorizon, number> = { "1d": 1, "1w": 7, "1m": 30, "3m": 90 };

function calcDueAt(detectedAt: string, horizon: ReviewHorizon): string {
  return addDaysJst(detectedAt, HORIZON_DAYS[horizon] ?? 30);
}

function calcStatus(dueAt: string, today: string): DueStatus {
  const weekLater = addDaysJst(today, 7);
  if (dueAt < today) return "overdue";
  if (dueAt === today) return "due_today";
  if (dueAt <= weekLater) return "due_this_week";
  return "not_due_yet";
}

function calcMissingFields(
  outcome: HypothesisOutcome,
  dueAt: string,
  today: string
): Array<"result" | "return1w" | "return1m" | "topixRelative1m"> {
  const missing: Array<"result" | "return1w" | "return1m" | "topixRelative1m"> = [];
  if (outcome.result === "unknown") missing.push("result");
  // return1w: horizon=1d の時は +7日後が期限。その期限が過ぎているなら missing
  const due1w = calcDueAt(outcome.hypothesis.detectedAt, "1w");
  const due1m = calcDueAt(outcome.hypothesis.detectedAt, "1m");
  if (outcome.return1w == null && due1w <= today) missing.push("return1w");
  if (outcome.return1m == null && due1m <= today) missing.push("return1m");
  if (outcome.relativeToTopix1m == null && due1m <= today) missing.push("topixRelative1m");
  return missing;
}

function nextActionFor(status: DueStatus, dueAt: string | null, missingFields: string[]): string {
  switch (status) {
    case "due_today":
      return "pnpm backfill:special-outcomes を dry-run し、必要なら pnpm backup && --write を検討";
    case "due_this_week":
      return `${dueAt} までに pnpm backfill:special-outcomes で補完を確認`;
    case "overdue":
      if (missingFields.length === 0) {
        return "期限切れだが全フィールド埋まり済み。outcomeStats の利用可能";
      }
      return `レビュー期限切れ [${missingFields.join("/")} 不足]。価格データを確認し pnpm backfill:special-outcomes --write を検討`;
    case "not_due_yet":
      return `期限未到達 (dueAt: ${dueAt})。期限後に再確認`;
    case "no_outcome_record":
      return "特殊状況候補に対応する outcome が未作成。pnpm candidate:hypothesis / pnpm review:hypotheses の接続を確認";
  }
}

// ─────────── メイン ───────────

function main(): void {
  const today = todayJst();

  // 候補読み込み
  type CandidateEntry = { code: string; name: string };
  type Config = { candidates?: CandidateEntry[] };
  const config = readYaml<Config>("config/special-situation-watch-rules.yml");
  const candidates = config.candidates ?? [];
  const candidateCodes = new Set(candidates.map(c => c.code));
  const codeToName = new Map(candidates.map(c => [c.code, c.name]));

  // outcome 読み込み
  const allOutcomes = readJsonl<HypothesisOutcome>("data/hypothesis_outcomes.jsonl");
  const allMatched = allOutcomes.filter(o => candidateCodes.has(o.code));

  // special_prefer: special_situation マーカーがある code はそちらを優先
  const specialCodes = new Set(allMatched.filter(isSpecialSituationOutcome).map(o => o.code));
  const matchedOutcomes = allMatched.filter(o =>
    isSpecialSituationOutcome(o) || !specialCodes.has(o.code)
  );

  // 混在検出と警告
  const mixed = detectMixedOutcomes(allOutcomes, candidateCodes);
  if (mixed.length > 0) {
    console.log(`[review:special-due] 注意: ${mixed.length}銘柄で special/normal outcome が混在。special を優先:`);
    for (const m of mixed) console.log(`  ${m.code}: special=${m.specialCount}, normal=${m.normalCount}`);
  }

  // コード → outcome マップ（special_prefer 適用済み）
  const outcomesByCode = new Map<string, HypothesisOutcome[]>();
  for (const o of matchedOutcomes) {
    if (!outcomesByCode.has(o.code)) outcomesByCode.set(o.code, []);
    outcomesByCode.get(o.code)!.push(o);
  }

  const dueToday: ReviewDueItem[] = [];
  const dueThisWeek: ReviewDueItem[] = [];
  const overdue: ReviewDueItem[] = [];
  const notDueYet: ReviewDueItem[] = [];
  const noOutcomeRecord: NoOutcomeRecord[] = [];

  // outcome がある候補
  for (const [code, outcomes] of outcomesByCode) {
    const name = codeToName.get(code) ?? code;
    for (const outcome of outcomes) {
      const detectedAt = outcome.hypothesis.detectedAt;
      const horizon = outcome.reviewHorizon;
      const dueAt = detectedAt ? calcDueAt(detectedAt, horizon) : null;
      const status = dueAt ? calcStatus(dueAt, today) : "no_outcome_record";
      const missingFields = calcMissingFields(outcome, dueAt ?? today, today);
      const outcomeKey = `${code}:${detectedAt}:${horizon}`;

      const item: ReviewDueItem = {
        code,
        name,
        outcomeKey,
        horizon,
        detectedAt: detectedAt ?? null,
        dueAt,
        status,
        missingFields,
        nextAction: nextActionFor(status, dueAt, missingFields),
      };

      switch (status) {
        case "due_today": dueToday.push(item); break;
        case "due_this_week": dueThisWeek.push(item); break;
        case "overdue": overdue.push(item); break;
        case "not_due_yet": notDueYet.push(item); break;
        default: notDueYet.push(item); break;
      }
    }
  }

  // outcome がない候補
  for (const c of candidates) {
    if (!outcomesByCode.has(c.code)) {
      noOutcomeRecord.push({
        code: c.code,
        name: c.name,
        reason: "hypothesis_outcomes.jsonl に対応するアウトカム記録がない",
        nextAction: "特殊状況候補に対応する outcome が未作成。pnpm candidate:hypothesis / pnpm review:hypotheses の接続を確認",
      });
    }
  }

  // ソート: dueAt 昇順
  const byDue = (a: ReviewDueItem, b: ReviewDueItem) =>
    (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
  dueToday.sort(byDue);
  dueThisWeek.sort(byDue);
  overdue.sort(byDue);
  notDueYet.sort(byDue);

  const notes: string[] = [
    "このレポートはデータ管理のためのもの。売買推奨ではありません。",
    "overdue は期限が過ぎているが、価格データ未取得の場合は pnpm backfill:special-outcomes で確認する。",
    "not_due_yet は正常。期限後に再確認する。",
    "no_outcome_record は hypothesis_outcomes.jsonl に記録がない候補。pnpm seed:special-outcomes を実行して seed を作成する。",
  ];
  if (mixed.length > 0) {
    notes.push(`[special_prefer] ${mixed.map(m => m.code).join("/")} で special/normal 混在を検出。special outcome を優先しました。`);
  }

  const report: SpecialSituationReviewDueReport = {
    generatedAt: today,
    today,
    summary: {
      totalCandidates: candidates.length,
      matchedOutcomes: matchedOutcomes.length,
      dueToday: dueToday.length,
      dueThisWeek: dueThisWeek.length,
      overdue: overdue.length,
      notDueYet: notDueYet.length,
      noOutcomeRecord: noOutcomeRecord.length,
    },
    dueToday,
    dueThisWeek,
    overdue,
    notDueYet,
    noOutcomeRecord,
    notes,
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, "special_situation_review_due_latest.json"), JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(join(REPORT_DIR, "special_situation_review_due_latest.md"), renderMarkdown(report), "utf-8");

  console.log(`=== special situation review due queue ===`);
  console.log(`today: ${today}`);
  console.log(`candidates: ${report.summary.totalCandidates}`);
  console.log(`matchedOutcomes: ${report.summary.matchedOutcomes}`);
  console.log(`dueToday: ${report.summary.dueToday}`);
  console.log(`dueThisWeek: ${report.summary.dueThisWeek}`);
  console.log(`overdue: ${report.summary.overdue}`);
  console.log(`notDueYet: ${report.summary.notDueYet}`);
  console.log(`noOutcomeRecord: ${report.summary.noOutcomeRecord}`);
}

// ─────────── Markdown ───────────

function renderMarkdown(report: SpecialSituationReviewDueReport): string {
  const lines: string[] = [];
  lines.push("# 特殊状況 review due queue", "");
  lines.push(`date: ${report.generatedAt}`, "");
  lines.push("> ※売買推奨ではありません。検証期限管理のためのレポートです。", "");

  lines.push("## summary", "");
  lines.push("| item | count |");
  lines.push("|---|---:|");
  lines.push(`| total candidates | ${report.summary.totalCandidates} |`);
  lines.push(`| matched outcomes | ${report.summary.matchedOutcomes} |`);
  lines.push(`| due today | ${report.summary.dueToday} |`);
  lines.push(`| due this week | ${report.summary.dueThisWeek} |`);
  lines.push(`| overdue | ${report.summary.overdue} |`);
  lines.push(`| not due yet | ${report.summary.notDueYet} |`);
  lines.push(`| no outcome record | ${report.summary.noOutcomeRecord} |`);
  lines.push("");

  const renderItems = (items: typeof report.dueToday, label: string) => {
    lines.push(`## ${label}`, "");
    if (items.length === 0) {
      lines.push("- 該当なし", "");
      return;
    }
    lines.push("| code | name | horizon | detectedAt | dueAt | missing | next action |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const item of items) {
      const missing = item.missingFields.length > 0 ? item.missingFields.join(", ") : "なし";
      lines.push(`| ${item.code} | ${item.name} | ${item.horizon} | ${item.detectedAt ?? "-"} | ${item.dueAt ?? "-"} | ${missing} | ${item.nextAction.slice(0, 60)} |`);
    }
    lines.push("");
  };

  renderItems(report.dueToday, "due today ⚠ 今日採点");
  renderItems(report.dueThisWeek, "due this week 今週採点");
  renderItems(report.overdue, "overdue ❌ 期限切れ");
  renderItems(report.notDueYet, "not due yet ✅ 期限未到達");

  lines.push("## no outcome record", "");
  if (report.noOutcomeRecord.length === 0) {
    lines.push("- 該当なし", "");
  } else {
    lines.push("| code | name | reason | next action |");
    lines.push("|---|---|---|---|");
    for (const item of report.noOutcomeRecord) {
      lines.push(`| ${item.code} | ${item.name} | ${item.reason} | ${item.nextAction.slice(0, 60)} |`);
    }
    lines.push("");
  }

  if (report.notes.length > 0) {
    lines.push("## notes", "");
    for (const note of report.notes) lines.push(`- ${note}`);
    lines.push("");
  }

  lines.push("## 次のアクション", "");
  lines.push("```");
  lines.push("1. pnpm watch:special                        # outcomeCoverageAudit を確認");
  lines.push("2. pnpm backfill:special-outcomes            # dry-run で補完可能性を確認");
  lines.push("3. pnpm review:special-due                   # due キューを更新");
  lines.push("4. overdue / due_today があれば:");
  lines.push("   pnpm backup");
  lines.push("   pnpm backfill:special-outcomes --write");
  lines.push("5. pnpm watch:special                        # outcomeStats を再確認");
  lines.push("```");
  lines.push("");
  lines.push(`*special situation review due queue | ${report.generatedAt} | ※売買推奨ではありません*`);
  return lines.join("\n");
}

main();
