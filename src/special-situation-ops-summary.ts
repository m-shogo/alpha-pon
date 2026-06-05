// 特殊状況ウォッチ 運用サマリー
// 今日やるべき運用確認を1つのレポートにまとめる。
// - noOutcomeRecord / seed 要否
// - overdue / dueToday / dueThisWeek / 期限未到達
// - backfill 構造的な補完可能性（J-Quants 不要・構造チェックのみ）
// - outcomeStats サンプル不足
// - special/normal outcome 混在
//
// このCLIはレポート生成のみ。data/hypothesis_outcomes.jsonl は更新しない。
//
// pnpm ops:special

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { addDaysJst, todayJst } from "./date.js";
import type { HypothesisOutcome, ReviewHorizon } from "./universe.js";
import {
  isSpecialSituationOutcome,
  detectMixedOutcomes,
  selectOutcomesForStats,
} from "./special-situation-outcome-filter.js";

const REPORT_DIR = "reports";
const OUTCOME_PATH = "data/hypothesis_outcomes.jsonl";
const CONFIG_PATH = "config/special-situation-watch-rules.yml";
const MIN_SAMPLE_SIZE_DEFAULT = 5;
const HORIZON_DAYS: Record<ReviewHorizon, number> = { "1d": 1, "1w": 7, "1m": 30, "3m": 90 };

// ─────────── 型定義 ───────────

type ActionPriority = "urgent" | "attention" | "info" | "ok";

type ActionItem = {
  priority: ActionPriority;
  category: "seed" | "backfill" | "review" | "data" | "health";
  title: string;
  detail: string;
  command?: string;
};

type OverdueDetail = {
  code: string;
  name: string;
  horizon: ReviewHorizon;
  dueAt: string;
  missingFields: Array<"result" | "return1w" | "return1m" | "topixRelative1m">;
};

type BackfillNeedDetail = {
  code: string;
  name: string;
  horizon: ReviewHorizon;
  dueAt: string;
  missingFields: string[];
};

type MixedOutcomeDetail = {
  code: string;
  specialCount: number;
  normalCount: number;
};

type SampleSmallDetail = {
  code: string;
  name: string;
  sampleSize: number;
};

type SpecialSituationOpsSummary = {
  generatedAt: string;
  today: string;
  healthStatus: "ok" | "needs_attention" | "action_required";
  actionItems: ActionItem[];
  coverage: {
    totalCandidates: number;
    withSpecialOutcome: number;
    noOutcomeRecord: number;
    noOutcomeRecordCodes: string[];
    needSeed: boolean;
  };
  reviewDue: {
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    notDueYet: number;
    overdueItems: OverdueDetail[];
    dueTodayItems: OverdueDetail[];
  };
  backfill: {
    structurallyUpdatable: number;
    notDueYet: number;
    updatableItems: BackfillNeedDetail[];
  };
  outcomeStats: {
    sampleTooSmall: number;
    hasStats: number;
    sampleSmallItems: SampleSmallDetail[];
  };
  mixedOutcomes: {
    count: number;
    items: MixedOutcomeDetail[];
    note: string;
  };
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

function dueAt(detectedAt: string, horizon: ReviewHorizon): string {
  return addDaysJst(detectedAt, HORIZON_DAYS[horizon] ?? 30);
}

function calcMissingFields(
  outcome: HypothesisOutcome,
  today: string
): Array<"result" | "return1w" | "return1m" | "topixRelative1m"> {
  const missing: Array<"result" | "return1w" | "return1m" | "topixRelative1m"> = [];
  if (outcome.result === "unknown") missing.push("result");
  const due1w = dueAt(outcome.hypothesis.detectedAt, "1w");
  const due1m = dueAt(outcome.hypothesis.detectedAt, "1m");
  if (outcome.return1w == null && due1w <= today) missing.push("return1w");
  if (outcome.return1m == null && due1m <= today) missing.push("return1m");
  if (outcome.relativeToTopix1m == null && due1m <= today) missing.push("topixRelative1m");
  return missing;
}

// ─────────── 集計ロジック ───────────

function buildOpsSummary(today: string): SpecialSituationOpsSummary {
  type CandidateEntry = { code: string; name: string };
  type Config = {
    candidates?: CandidateEntry[];
    outcomeStats?: { minSampleSize?: number };
  };

  const config = readYaml<Config>(CONFIG_PATH);
  const candidates = config.candidates ?? [];
  const candidateCodes = new Set(candidates.map(c => c.code));
  const codeToName = new Map(candidates.map(c => [c.code, c.name]));
  const minSampleSize = config.outcomeStats?.minSampleSize ?? MIN_SAMPLE_SIZE_DEFAULT;

  const allOutcomes = readJsonl<HypothesisOutcome>(OUTCOME_PATH);

  // special_prefer: special があるコードは special のみ使う
  const allMatched = allOutcomes.filter(o => candidateCodes.has(o.code));
  const specialCodes = new Set(allMatched.filter(isSpecialSituationOutcome).map(o => o.code));
  const matchedOutcomes = allMatched.filter(o =>
    isSpecialSituationOutcome(o) || !specialCodes.has(o.code)
  );

  // 混在検出
  const mixed = detectMixedOutcomes(allOutcomes, candidateCodes);
  const mixedItems: MixedOutcomeDetail[] = mixed.map(m => ({
    code: m.code,
    specialCount: m.specialCount,
    normalCount: m.normalCount,
  }));

  // outcome があるコード
  const outcomeCodes = new Set(matchedOutcomes.map(o => o.code));

  // noOutcomeRecord
  const noOutcomeRecordCodes = candidates.filter(c => !outcomeCodes.has(c.code)).map(c => c.code);
  const withSpecialOutcome = candidates.filter(c => specialCodes.has(c.code)).length;

  // review due 分類
  const overdueDue: OverdueDetail[] = [];
  const dueTodayItems: OverdueDetail[] = [];
  let dueThisWeekCount = 0;
  let notDueYetCount = 0;
  const structurallyUpdatable: BackfillNeedDetail[] = [];
  let notDueYetBackfill = 0;

  for (const outcome of matchedOutcomes) {
    const { detectedAt, reviewHorizon: horizon } = { detectedAt: outcome.hypothesis.detectedAt, reviewHorizon: outcome.reviewHorizon };
    const due = dueAt(detectedAt, horizon);
    const weekLater = addDaysJst(today, 7);
    const name = codeToName.get(outcome.code) ?? outcome.code;
    const missingFields = calcMissingFields(outcome, today);

    if (due < today) {
      const item: OverdueDetail = { code: outcome.code, name, horizon, dueAt: due, missingFields };
      overdueDue.push(item);
      if (missingFields.length > 0) {
        structurallyUpdatable.push({ code: outcome.code, name, horizon, dueAt: due, missingFields: missingFields as string[] });
      }
    } else if (due === today) {
      dueTodayItems.push({ code: outcome.code, name, horizon, dueAt: due, missingFields });
      if (missingFields.length > 0) {
        structurallyUpdatable.push({ code: outcome.code, name, horizon, dueAt: due, missingFields: missingFields as string[] });
      }
    } else if (due <= weekLater) {
      dueThisWeekCount++;
    } else {
      notDueYetCount++;
      notDueYetBackfill++;
    }
  }

  // outcomeStats サンプル不足チェック
  const sampleSmallItems: SampleSmallDetail[] = [];
  let hasStatsCount = 0;
  for (const c of candidates) {
    const { selected } = selectOutcomesForStats(matchedOutcomes, c.code);
    if (selected.length === 0) continue;
    hasStatsCount++;
    if (selected.length < minSampleSize) {
      sampleSmallItems.push({ code: c.code, name: c.name, sampleSize: selected.length });
    }
  }

  // アクション生成（優先順）
  const actionItems: ActionItem[] = [];

  if (noOutcomeRecordCodes.length > 0) {
    actionItems.push({
      priority: "urgent",
      category: "seed",
      title: `要確認: ${noOutcomeRecordCodes.length}件 outcome 未作成`,
      detail: `以下の銘柄に outcome 記録がありません: ${noOutcomeRecordCodes.join(", ")}`,
      command: "pnpm seed:special-outcomes",
    });
  }

  const overdueWithMissing = overdueDue.filter(o => o.missingFields.length > 0);
  if (overdueWithMissing.length > 0) {
    const codes = [...new Set(overdueWithMissing.map(o => o.code))];
    actionItems.push({
      priority: "urgent",
      category: "backfill",
      title: `要確認: ${overdueWithMissing.length}件 期限切れ・フィールド不足`,
      detail: `${codes.join(", ")} で期限超過かつ result/return 不足。backfill で補完を検討。`,
      command: "pnpm backup && pnpm backfill:special-outcomes --write",
    });
  }

  if (dueTodayItems.length > 0) {
    const codes = [...new Set(dueTodayItems.map(o => o.code))];
    actionItems.push({
      priority: "attention",
      category: "review",
      title: `期限管理: 本日採点 ${dueTodayItems.length}件`,
      detail: `${codes.join(", ")} の horizon が本日到達。backfill dry-run で補完可能性を確認。`,
      command: "pnpm backfill:special-outcomes",
    });
  }

  if (structurallyUpdatable.length > 0 && overdueWithMissing.length === 0 && dueTodayItems.length === 0) {
    actionItems.push({
      priority: "attention",
      category: "backfill",
      title: `検証: ${structurallyUpdatable.length}件 補完可能（期限到来済み）`,
      detail: "horizon 期限が到来しており backfill が可能です。J-Quants 価格データを取得して補完を検討。",
      command: "pnpm backfill:special-outcomes",
    });
  }

  if (sampleSmallItems.length > 0) {
    actionItems.push({
      priority: "info",
      category: "data",
      title: `サンプル不足: ${sampleSmallItems.length}件 (minSample=${minSampleSize})`,
      detail: `${sampleSmallItems.map(s => `${s.code}(n=${s.sampleSize})`).join(", ")} は統計的にサンプル不足。期限後に自動解消予定。`,
    });
  }

  if (dueThisWeekCount > 0) {
    actionItems.push({
      priority: "info",
      category: "review",
      title: `期限管理: 今週中に採点 ${dueThisWeekCount}件`,
      detail: "今週中に horizon 期限が到来する outcome があります。週内に review:special-due で再確認。",
      command: "pnpm review:special-due",
    });
  }

  if (notDueYetCount > 0) {
    actionItems.push({
      priority: "ok",
      category: "review",
      title: `未到達: ${notDueYetCount}件 正常待機中`,
      detail: "horizon 期限未到達の outcome は正常状態です。期限後に再確認してください。",
    });
  }

  if (mixedItems.length > 0) {
    actionItems.push({
      priority: "info",
      category: "health",
      title: `検証: ${mixedItems.length}件 special/normal 混在（自動で special 優先適用済み）`,
      detail: `${mixedItems.map(m => `${m.code}(special=${m.specialCount}/normal=${m.normalCount})`).join(", ")} で混在を検出。v10 special_prefer ロジックにより special を優先中。`,
    });
  }

  if (actionItems.length === 0 || actionItems.every(a => a.priority === "ok")) {
    actionItems.push({
      priority: "ok",
      category: "health",
      title: "運用確認: 問題なし",
      detail: "全ての特殊状況候補に outcome 記録があり、期限内または期限前の正常状態です。",
    });
  }

  // healthStatus 決定
  const hasUrgent = actionItems.some(a => a.priority === "urgent");
  const hasAttention = actionItems.some(a => a.priority === "attention");
  const healthStatus: "ok" | "needs_attention" | "action_required" = hasUrgent
    ? "action_required"
    : hasAttention
    ? "needs_attention"
    : "ok";

  const notes: string[] = [
    "このレポートは運用確認のためのもの。売買推奨ではありません。",
    "backfill の structurallyUpdatable は構造チェックのみ。実際の価格補完には J-Quants が必要です。",
    "sampleTooSmall は参考値のみ。統計的判断の根拠にしないでください。",
    "期限未到達 (notDueYet) は正常状態です。",
  ];
  if (mixedItems.length > 0) {
    notes.push(`[special_prefer] ${mixedItems.map(m => m.code).join("/")} で混在を検出。全CLIで special outcome を優先して使用中。`);
  }

  return {
    generatedAt: today,
    today,
    healthStatus,
    actionItems,
    coverage: {
      totalCandidates: candidates.length,
      withSpecialOutcome,
      noOutcomeRecord: noOutcomeRecordCodes.length,
      noOutcomeRecordCodes,
      needSeed: noOutcomeRecordCodes.length > 0,
    },
    reviewDue: {
      overdue: overdueDue.length,
      dueToday: dueTodayItems.length,
      dueThisWeek: dueThisWeekCount,
      notDueYet: notDueYetCount,
      overdueItems: overdueDue,
      dueTodayItems,
    },
    backfill: {
      structurallyUpdatable: structurallyUpdatable.length,
      notDueYet: notDueYetBackfill,
      updatableItems: structurallyUpdatable,
    },
    outcomeStats: {
      sampleTooSmall: sampleSmallItems.length,
      hasStats: hasStatsCount,
      sampleSmallItems,
    },
    mixedOutcomes: {
      count: mixedItems.length,
      items: mixedItems,
      note: mixedItems.length > 0
        ? "v10 special_prefer により全 CLI で special outcome を優先使用中"
        : "混在なし",
    },
    notes,
  };
}

// ─────────── Markdown レンダリング ───────────

function priorityIcon(p: ActionPriority): string {
  switch (p) {
    case "urgent": return "🔴";
    case "attention": return "🟡";
    case "info": return "🔵";
    case "ok": return "✅";
  }
}

function renderMarkdown(report: SpecialSituationOpsSummary): string {
  const lines: string[] = [];
  lines.push("# 特殊状況ウォッチ 運用サマリー", "");
  lines.push(`date: ${report.generatedAt}`, "");
  lines.push(`healthStatus: **${report.healthStatus}**`, "");
  lines.push("> ※売買推奨ではありません。運用確認・期限管理のためのレポートです。", "");

  // アクション一覧
  lines.push("## 今日やること（アクション一覧）", "");
  for (const item of report.actionItems) {
    lines.push(`### ${priorityIcon(item.priority)} ${item.title}`);
    lines.push(`- ${item.detail}`);
    if (item.command) lines.push(`- コマンド: \`${item.command}\``);
    lines.push("");
  }

  // カバレッジ
  lines.push("## カバレッジ", "");
  lines.push("| item | count |");
  lines.push("|---|---:|");
  lines.push(`| 候補銘柄数 | ${report.coverage.totalCandidates} |`);
  lines.push(`| special outcome 保有 | ${report.coverage.withSpecialOutcome} |`);
  lines.push(`| outcome 未作成 (noOutcomeRecord) | ${report.coverage.noOutcomeRecord} |`);
  if (report.coverage.noOutcomeRecordCodes.length > 0) {
    lines.push(`- 対象: ${report.coverage.noOutcomeRecordCodes.join(", ")}`);
  }
  lines.push("");

  // review due
  lines.push("## review due 状況", "");
  lines.push("| status | count |");
  lines.push("|---|---:|");
  lines.push(`| overdue (期限切れ) | ${report.reviewDue.overdue} |`);
  lines.push(`| due today (本日採点) | ${report.reviewDue.dueToday} |`);
  lines.push(`| due this week (今週採点) | ${report.reviewDue.dueThisWeek} |`);
  lines.push(`| not due yet (未到達) | ${report.reviewDue.notDueYet} |`);
  lines.push("");

  if (report.reviewDue.overdueItems.length > 0) {
    lines.push("### 期限切れ明細", "");
    lines.push("| code | name | horizon | dueAt | 不足フィールド |");
    lines.push("|---|---|---|---|---|");
    for (const item of report.reviewDue.overdueItems) {
      const missing = item.missingFields.length > 0 ? item.missingFields.join(", ") : "なし（補完済み）";
      lines.push(`| ${item.code} | ${item.name} | ${item.horizon} | ${item.dueAt} | ${missing} |`);
    }
    lines.push("");
  }

  if (report.reviewDue.dueTodayItems.length > 0) {
    lines.push("### 本日採点明細", "");
    lines.push("| code | name | horizon | dueAt |");
    lines.push("|---|---|---|---|");
    for (const item of report.reviewDue.dueTodayItems) {
      lines.push(`| ${item.code} | ${item.name} | ${item.horizon} | ${item.dueAt} |`);
    }
    lines.push("");
  }

  // backfill
  lines.push("## backfill 構造チェック", "");
  lines.push("| item | count |");
  lines.push("|---|---:|");
  lines.push(`| 構造的に補完可能 (期限到来済み) | ${report.backfill.structurallyUpdatable} |`);
  lines.push(`| 期限未到達 (未到達・正常) | ${report.backfill.notDueYet} |`);
  lines.push("");
  lines.push("> ※実際の価格補完には J-Quants API が必要です。`pnpm backfill:special-outcomes` (dry-run) で確認してください。", "");
  lines.push("");

  if (report.backfill.updatableItems.length > 0) {
    lines.push("### 補完可能明細", "");
    lines.push("| code | horizon | dueAt | 不足フィールド |");
    lines.push("|---|---|---|---|");
    for (const item of report.backfill.updatableItems.slice(0, 15)) {
      lines.push(`| ${item.code} | ${item.horizon} | ${item.dueAt} | ${item.missingFields.join(", ")} |`);
    }
    if (report.backfill.updatableItems.length > 15) {
      lines.push(`| ... | | | +${report.backfill.updatableItems.length - 15}件省略 |`);
    }
    lines.push("");
  }

  // outcomeStats
  lines.push("## outcomeStats 状況", "");
  lines.push("| item | count |");
  lines.push("|---|---:|");
  lines.push(`| stats あり | ${report.outcomeStats.hasStats} |`);
  lines.push(`| サンプル不足 (minSample=${MIN_SAMPLE_SIZE_DEFAULT}) | ${report.outcomeStats.sampleTooSmall} |`);
  lines.push("");
  if (report.outcomeStats.sampleSmallItems.length > 0) {
    lines.push("> ⚠ サンプル不足は参考値のみ。統計的判断の根拠にしないでください。", "");
    lines.push("| code | name | sampleSize |");
    lines.push("|---|---|---:|");
    for (const s of report.outcomeStats.sampleSmallItems) {
      lines.push(`| ${s.code} | ${s.name} | ${s.sampleSize} |`);
    }
    lines.push("");
  }

  // 混在
  lines.push("## special/normal 混在チェック", "");
  lines.push(`- 混在検出: ${report.mixedOutcomes.count}件`);
  lines.push(`- ${report.mixedOutcomes.note}`);
  if (report.mixedOutcomes.items.length > 0) {
    lines.push("");
    lines.push("| code | special | normal | 対応 |");
    lines.push("|---|---:|---:|---|");
    for (const m of report.mixedOutcomes.items) {
      lines.push(`| ${m.code} | ${m.specialCount} | ${m.normalCount} | special_prefer 適用済み |`);
    }
  }
  lines.push("");

  // notes
  if (report.notes.length > 0) {
    lines.push("## notes", "");
    for (const note of report.notes) lines.push(`- ${note}`);
    lines.push("");
  }

  // 次のアクション
  lines.push("## 次のステップ", "");
  lines.push("```");
  lines.push("# 1. 運用サマリーで全体把握");
  lines.push("pnpm ops:special");
  lines.push("");
  lines.push("# 2. backfill 可能性を確認 (dry-run)");
  lines.push("pnpm backfill:special-outcomes");
  lines.push("");
  lines.push("# 3. overdue / due_today があれば補完");
  lines.push("pnpm backup");
  lines.push("pnpm backfill:special-outcomes --write");
  lines.push("");
  lines.push("# 4. outcomeStats / outcomeCoverageAudit を詳細確認");
  lines.push("pnpm watch:special");
  lines.push("```");
  lines.push("");
  lines.push(`*special situation ops summary | ${report.generatedAt} | ※売買推奨ではありません*`);
  return lines.join("\n");
}

// ─────────── メイン ───────────

function main(): void {
  const today = todayJst();
  const report = buildOpsSummary(today);

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    join(REPORT_DIR, "special_situation_ops_summary_latest.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );
  writeFileSync(
    join(REPORT_DIR, "special_situation_ops_summary_latest.md"),
    renderMarkdown(report),
    "utf-8"
  );

  console.log(`=== special situation ops summary ===`);
  console.log(`today: ${report.today}`);
  console.log(`healthStatus: ${report.healthStatus}`);
  console.log(`candidates: ${report.coverage.totalCandidates}`);
  console.log(`noOutcomeRecord: ${report.coverage.noOutcomeRecord}`);
  console.log(`overdue: ${report.reviewDue.overdue}`);
  console.log(`dueToday: ${report.reviewDue.dueToday}`);
  console.log(`dueThisWeek: ${report.reviewDue.dueThisWeek}`);
  console.log(`notDueYet: ${report.reviewDue.notDueYet}`);
  console.log(`structurallyUpdatable: ${report.backfill.structurallyUpdatable}`);
  console.log(`sampleTooSmall: ${report.outcomeStats.sampleTooSmall}`);
  console.log(`mixedOutcomes: ${report.mixedOutcomes.count}`);
  console.log("");
  console.log("--- アクション ---");
  for (const item of report.actionItems) {
    console.log(`[${item.priority.toUpperCase()}] ${item.title}`);
    if (item.command) console.log(`  → ${item.command}`);
  }
}

main();
