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
  isHistoricalSeedOverdue,
} from "./special-situation-outcome-filter.js";
import {
  calcSpecialSituationDueAt,
  partitionSpecialSituationOutcomesByDetectedAt,
} from "./special-situation-review-due-date.js";

const REPORT_DIR = "reports";
const OUTCOME_PATH = "data/hypothesis_outcomes.jsonl";
const CONFIG_PATH = "config/special-situation-watch-rules.yml";
const MIN_SAMPLE_SIZE_DEFAULT = 5;
// J-Quants 無料プランのデータ提供遅延（日数）。src/fetcher/jquants.ts の v2DateCapCompact と同じ既定値。
// 期日がこの遅延期間内にある overdue は、価格データ自体が未提供のため backfill 不可（待機が正常）。
const JQUANTS_DATA_DELAY_DAYS = Number(process.env.JQUANTS_V2_DATA_DELAY_DAYS ?? "84");

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
    historicalSeedOverdue: number;
    priceDataPending: number;
    dueToday: number;
    dueThisWeek: number;
    notDueYet: number;
    overdueItems: OverdueDetail[];
    historicalSeedOverdueItems: OverdueDetail[];
    dueTodayItems: OverdueDetail[];
  };
  backfill: {
    structurallyUpdatable: number;
    historicalUpdatable: number;
    recentUpdatable: number;
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

function calcMissingFields(
  outcome: HypothesisOutcome,
  today: string
): Array<"result" | "return1w" | "return1m" | "topixRelative1m"> {
  const missing: Array<"result" | "return1w" | "return1m" | "topixRelative1m"> = [];
  if (outcome.result === "unknown") missing.push("result");
  const due1w = calcSpecialSituationDueAt(outcome.hypothesis.detectedAt, "1w");
  const due1m = calcSpecialSituationDueAt(outcome.hypothesis.detectedAt, "1m");
  if (outcome.return1w == null && due1w !== null && due1w <= today) missing.push("return1w");
  if (outcome.return1m == null && due1m !== null && due1m <= today) missing.push("return1m");
  if (outcome.relativeToTopix1m == null && due1m !== null && due1m <= today) missing.push("topixRelative1m");
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
  const { valid: validOutcomes, invalid: invalidDateOutcomes } =
    partitionSpecialSituationOutcomesByDetectedAt(matchedOutcomes);
  const invalidDateCodes = [...new Set(invalidDateOutcomes.map(o => o.code))].sort();

  // 混在検出
  const mixed = detectMixedOutcomes(allOutcomes, candidateCodes);
  const mixedItems: MixedOutcomeDetail[] = mixed.map(m => ({
    code: m.code,
    specialCount: m.specialCount,
    normalCount: m.normalCount,
  }));

  // outcome があるコード。不正日付でも record 自体は存在するため seed 対象には戻さない。
  const outcomeCodes = new Set(matchedOutcomes.map(o => o.code));

  // noOutcomeRecord
  const noOutcomeRecordCodes = candidates.filter(c => !outcomeCodes.has(c.code)).map(c => c.code);
  const withSpecialOutcome = candidates.filter(c => specialCodes.has(c.code)).length;

  // review due 分類
  // overdue を recent（90日以内）と historical（90日超・過去日付 seed 由来）に分離する
  const recentOverdueItems: OverdueDetail[] = [];
  const historicalSeedOverdueItems: OverdueDetail[] = [];
  const dueTodayItems: OverdueDetail[] = [];
  let dueThisWeekCount = 0;
  let notDueYetCount = 0;
  const recentUpdatableItems: BackfillNeedDetail[] = [];
  const historicalUpdatableItems: BackfillNeedDetail[] = [];
  let notDueYetBackfill = 0;

  for (const outcome of validOutcomes) {
    const detectedAt = outcome.hypothesis.detectedAt;
    const horizon = outcome.reviewHorizon;
    const due = calcSpecialSituationDueAt(detectedAt, horizon);
    if (due === null) continue;
    const weekLater = addDaysJst(today, 7);
    const name = codeToName.get(outcome.code) ?? outcome.code;
    const missingFields = calcMissingFields(outcome, today);

    if (due < today) {
      const item: OverdueDetail = { code: outcome.code, name, horizon, dueAt: due, missingFields };
      if (isHistoricalSeedOverdue(due, today)) {
        historicalSeedOverdueItems.push(item);
        if (missingFields.length > 0) {
          historicalUpdatableItems.push({ code: outcome.code, name, horizon, dueAt: due, missingFields: missingFields as string[] });
        }
      } else {
        recentOverdueItems.push(item);
        if (missingFields.length > 0) {
          recentUpdatableItems.push({ code: outcome.code, name, horizon, dueAt: due, missingFields: missingFields as string[] });
        }
      }
    } else if (due === today) {
      dueTodayItems.push({ code: outcome.code, name, horizon, dueAt: due, missingFields });
      if (missingFields.length > 0) {
        recentUpdatableItems.push({ code: outcome.code, name, horizon, dueAt: due, missingFields: missingFields as string[] });
      }
    } else if (due <= weekLater) {
      dueThisWeekCount++;
    } else {
      notDueYetCount++;
      notDueYetBackfill++;
    }
  }
  const allStructurallyUpdatable = [...recentUpdatableItems, ...historicalUpdatableItems];

  // outcomeStats サンプル不足チェック。不正 detectedAt の row は時系列根拠に使わない。
  const sampleSmallItems: SampleSmallDetail[] = [];
  let hasStatsCount = 0;
  for (const c of candidates) {
    const { selected } = selectOutcomesForStats(validOutcomes, c.code);
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

  if (invalidDateCodes.length > 0) {
    actionItems.push({
      priority: "attention",
      category: "data",
      title: `データ不整合: ${invalidDateOutcomes.length}件 detectedAt 不正`,
      detail: `${invalidDateCodes.join(", ")} の outcome は detectedAt が不正なため、期限分類・backfill候補・outcomeStatsから除外しました。元データを確認してください。`,
    });
  }

  // recent overdue（90日以内）: 急ぎの採点待ち → urgent
  const recentOverdueWithMissing = recentOverdueItems.filter(o => o.missingFields.length > 0);
  const recentOverdueActionable = recentOverdueWithMissing.filter(o =>
    o.missingFields.some(field => field !== "result")
  );
  const recentOverdueResultOnly = recentOverdueWithMissing.filter(o =>
    o.missingFields.length === 1 && o.missingFields[0] === "result"
  );
  if (recentOverdueActionable.length > 0) {
    const codes = [...new Set(recentOverdueActionable.map(o => o.code))];
    actionItems.push({
      priority: "urgent",
      category: "backfill",
      title: `採点待ち: ${recentOverdueActionable.length}件 期限切れ・フィールド不足`,
      detail: `${codes.join(", ")} で期限超過かつ result/return 不足。backfill で補完を検討。`,
      command: "pnpm backup && pnpm backfill:special-outcomes --write",
    });
  }

  // 価格データ提供キャップ: J-Quants 無料プランの遅延により、
  // この日付より新しい期日の価格はまだ提供されていない（待機が正常状態）
  const priceDataCap = addDaysJst(today, -JQUANTS_DATA_DELAY_DAYS);
  const priceDataPendingItems = recentOverdueResultOnly.filter(o => o.dueAt > priceDataCap);
  const priceDataReadyItems = recentOverdueResultOnly.filter(o => o.dueAt <= priceDataCap);

  if (priceDataReadyItems.length > 0) {
    const codes = [...new Set(priceDataReadyItems.map(o => o.code))];
    actionItems.push({
      priority: "attention",
      category: "review",
      title: `価格反映待ち: ${priceDataReadyItems.length}件 1d result 未評価`,
      detail: `${codes.join(", ")} は return/topix 系の補完ではなく、1d result 判定用の翌営業日価格待ち。データ提供期間内なのに未取得のため dry-run で確認。`,
      command: "pnpm backfill:special-outcomes",
    });
  }

  if (priceDataPendingItems.length > 0) {
    const codes = [...new Set(priceDataPendingItems.map(o => o.code))];
    const earliestDue = [...priceDataPendingItems.map(o => o.dueAt)].sort()[0];
    const availableFrom = addDaysJst(earliestDue, JQUANTS_DATA_DELAY_DAYS);
    actionItems.push({
      priority: "info",
      category: "review",
      title: `価格データ提供待ち: ${priceDataPendingItems.length}件 1d result 未評価`,
      detail: `${codes.join(", ")} は J-Quants のデータ提供遅延（${JQUANTS_DATA_DELAY_DAYS}日）の範囲内で、価格データ自体がまだ提供されていません。${availableFrom} 以降に pnpm backfill:special-outcomes を再実行。`,
      command: "pnpm backfill:special-outcomes",
    });
  }

  // historical seed overdue（90日超・過去日付 seed）: データ補完候補 → info
  const historicalWithMissing = historicalSeedOverdueItems.filter(o => o.missingFields.length > 0);
  if (historicalWithMissing.length > 0) {
    const codes = [...new Set(historicalWithMissing.map(o => o.code))];
    actionItems.push({
      priority: "info",
      category: "backfill",
      title: `過去日付seed: ${historicalWithMissing.length}件 データ補完候補（上場日由来）`,
      detail: `${codes.join(", ")} の detectedAt は上場日の過去日付です。急ぎの投資判断ではなく検証用データの補完候補。`,
      command: "pnpm backfill:special-outcomes",
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

  // recent な updatable があれば attention で通知（historical は別途 info で通知済み）
  if (recentUpdatableItems.length > 0 && recentOverdueActionable.length === 0 && recentOverdueResultOnly.length === 0 && dueTodayItems.length === 0) {
    actionItems.push({
      priority: "attention",
      category: "backfill",
      title: `検証: ${recentUpdatableItems.length}件 補完可能（採点期限到来済み）`,
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
    "historical_seed_overdue は上場日を detectedAt に使った過去日付 seed。急ぎの投資判断ではなく検証用データの補完候補。",
    "backfill の structurallyUpdatable は構造チェックのみ。実際の価格補完には J-Quants が必要です。",
    "sampleTooSmall は参考値のみ。統計的判断の根拠にしないでください。",
    "期限未到達 (notDueYet) は正常状態です。",
  ];
  if (invalidDateCodes.length > 0) {
    notes.push(`detectedAt 不正の outcome (${invalidDateCodes.join("/")}) は期限分類・backfill候補・outcomeStatsから除外しました。`);
  }
  if (priceDataPendingItems.length > 0) {
    notes.push(`価格データ提供待ち (priceDataPending) は J-Quants 無料プランの提供遅延（${JQUANTS_DATA_DELAY_DAYS}日）によるもので、異常ではありません。`);
  }
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
      overdue: recentOverdueItems.length,
      historicalSeedOverdue: historicalSeedOverdueItems.length,
      priceDataPending: priceDataPendingItems.length,
      dueToday: dueTodayItems.length,
      dueThisWeek: dueThisWeekCount,
      notDueYet: notDueYetCount,
      overdueItems: recentOverdueItems,
      historicalSeedOverdueItems,
      dueTodayItems,
    },
    backfill: {
      structurallyUpdatable: allStructurallyUpdatable.length,
      historicalUpdatable: historicalUpdatableItems.length,
      recentUpdatable: recentUpdatableItems.length,
      notDueYet: notDueYetBackfill,
      updatableItems: allStructurallyUpdatable,
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
  lines.push(`| overdue 採点待ち（90日以内）| ${report.reviewDue.overdue} |`);
  lines.push(`|   うち価格データ提供待ち（J-Quants 遅延・待機が正常）| ${report.reviewDue.priceDataPending} |`);
  lines.push(`| historical seed overdue 過去日付seed（90日超）| ${report.reviewDue.historicalSeedOverdue} |`);
  lines.push(`| due today (本日採点) | ${report.reviewDue.dueToday} |`);
  lines.push(`| due this week (今週採点) | ${report.reviewDue.dueThisWeek} |`);
  lines.push(`| not due yet (未到達) | ${report.reviewDue.notDueYet} |`);
  lines.push("");

  if (report.reviewDue.overdueItems.length > 0) {
    lines.push("### 採点待ち明細（recent overdue）", "");
    lines.push("| code | name | horizon | dueAt | 不足フィールド |");
    lines.push("|---|---|---|---|---|");
    for (const item of report.reviewDue.overdueItems) {
      const missing = item.missingFields.length > 0 ? item.missingFields.join(", ") : "なし（補完済み）";
      lines.push(`| ${item.code} | ${item.name} | ${item.horizon} | ${item.dueAt} | ${missing} |`);
    }
    lines.push("");
  }

  if (report.reviewDue.historicalSeedOverdueItems.length > 0) {
    lines.push("### 過去日付seed明細（historical seed overdue）", "");
    lines.push("> ※上場日を detectedAt に使った seed のため overdue 扱い。急ぎの投資判断ではなく検証用データの補完候補。", "");
    lines.push("| code | name | horizon | dueAt | 不足フィールド |");
    lines.push("|---|---|---|---|---|");
    for (const item of report.reviewDue.historicalSeedOverdueItems) {
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
  lines.push(`| 構造的に補完可能 合計 | ${report.backfill.structurallyUpdatable} |`);
  lines.push(`|   うち recent overdue（採点待ち） | ${report.backfill.recentUpdatable} |`);
  lines.push(`|   うち historical seed（過去日付seed） | ${report.backfill.historicalUpdatable} |`);
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
  console.log(`overdue (recent): ${report.reviewDue.overdue}`);
  console.log(`priceDataPending: ${report.reviewDue.priceDataPending}`);
  console.log(`historicalSeedOverdue: ${report.reviewDue.historicalSeedOverdue}`);
  console.log(`dueToday: ${report.reviewDue.dueToday}`);
  console.log(`dueThisWeek: ${report.reviewDue.dueThisWeek}`);
  console.log(`notDueYet: ${report.reviewDue.notDueYet}`);
  console.log(`structurallyUpdatable: ${report.backfill.structurallyUpdatable} (recent=${report.backfill.recentUpdatable}, historical=${report.backfill.historicalUpdatable})`);
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
