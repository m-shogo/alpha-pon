// 特殊状況ウォッチ outcome backfill
// data/hypothesis_outcomes.jsonl のうち、specialSituationWatch 候補に紐づく行の
// result / return1w / return1m / topixRelative1m 不足を安全に補完する。
//
// 使い方:
//   pnpm backfill:special-outcomes          → dry-run（何も書き換えない）
//   pnpm backfill:special-outcomes --write  → 価格取得・JSON 更新
//
// 安全ルール:
//   - dry-run では絶対にファイルを変更しない
//   - 既存値は上書きしない（null/missing のみ埋める）
//   - 既存行を削除しない
//   - 重複行を追加しない

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { addDaysJst, toCompactDate, todayJst } from "./date.js";
import { fetchDailyQuotes, isJQuantsConfigured } from "./fetcher/jquants.js";
import type { HypothesisOutcome, ReviewHorizon } from "./universe.js";
import { isSpecialSituationOutcome, detectMixedOutcomes } from "./special-situation-outcome-filter.js";

const OUTCOME_PATH = "data/hypothesis_outcomes.jsonl";
const TOPIX_ETF_CODE = "1306";
const REPORT_DIR = "reports";

// ─────────── 型定義 ───────────

type MissingReason =
  | "price_at_detectedAt_missing"
  | "price_1d_missing"
  | "price_1w_missing"
  | "price_1m_missing"
  | "topix_price_missing"
  | "not_due_yet"
  | "no_price_source"
  | "jquants_not_configured"
  | "no_outcome_record"
  | "already_filled"
  | "ambiguous_outcome_match";

type BackfillByCode = {
  code: string;
  name: string;
  matchedOutcomes: number;
  updatable: number;
  updated: number;
  skipped: number;
  missingReasons: string[];
  nextAction: string;
};

type UpdatePreview = {
  code: string;
  outcomeKey: string;
  fieldsToFill: string[];
  reason: string;
  willWrite: boolean;
};

type SpecialSituationOutcomeBackfillReport = {
  generatedAt: string;
  dryRun: boolean;
  summary: {
    candidates: number;
    matchedOutcomes: number;
    updatableOutcomes: number;
    updatedOutcomes: number;
    skippedOutcomes: number;
    notDueYet: number;
  };
  missing: {
    result: number;
    return1w: number;
    return1m: number;
    topixRelative1m: number;
  };
  notDueYet: {
    return1w: number;
    return1m: number;
  };
  byCode: BackfillByCode[];
  updatesPreview: UpdatePreview[];
  notes: string[];
};

// ─────────── ヘルパ ───────────

type DailyQuote = { Date: string; AdjustmentClose: number };
type ReturnData = {
  base: number | null; p1d: number | null; p1w: number | null; p1m: number | null;
  ret1d: number | null; ret1w: number | null; ret1m: number | null;
};

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => JSON.parse(l) as T);
}

function readYaml<T>(path: string): T {
  return load(readFileSync(path, "utf-8")) as T;
}

function findPriceOnOrAfter(quotes: DailyQuote[], targetCompact: string): number | null {
  const sorted = [...quotes].sort((a, b) => a.Date.localeCompare(b.Date));
  return sorted.find(q => q.Date >= targetCompact)?.AdjustmentClose ?? null;
}

function calcPct(base: number | null, target: number | null): number | null {
  if (!base || !target) return null;
  return ((target - base) / base) * 100;
}

function buildReturnData(quotes: DailyQuote[], detectedAt: string): ReturnData {
  const sorted = [...quotes].sort((a, b) => a.Date.localeCompare(b.Date));
  const base = sorted[0]?.AdjustmentClose ?? null;
  const p1d = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 1)));
  const p1w = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 7)));
  const p1m = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 30)));
  return { base, p1d, p1w, p1m, ret1d: calcPct(base, p1d), ret1w: calcPct(base, p1w), ret1m: calcPct(base, p1m) };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const HORIZON_DAYS: Record<ReviewHorizon, number> = { "1d": 1, "1w": 7, "1m": 30, "3m": 90 };

function isNotDueYet(detectedAt: string, horizon: ReviewHorizon, today: string): boolean {
  const days = HORIZON_DAYS[horizon] ?? 30;
  return addDaysJst(detectedAt, days) > today;
}

function nextActionFor(row: BackfillByCode): string {
  if (row.matchedOutcomes === 0) return "仮説を記録してから pnpm review:hypotheses を実行する";
  if (row.missingReasons.includes("jquants_not_configured")) return "J-Quants API キーを設定して再実行";
  if (row.missingReasons.includes("not_due_yet")) return "reviewHorizon の期限後に pnpm backfill:special-outcomes --write";
  if (row.missingReasons.includes("price_at_detectedAt_missing")) return "J-Quants 価格データが不足。pnpm backfill:special-outcomes --write で再試行";
  if (row.missingReasons.includes("already_filled")) return "成績集計に利用可能";
  if (row.updatable > 0) return "pnpm backup && pnpm backfill:special-outcomes --write で補完可能";
  return "pnpm review:hypotheses で hit/miss レビューを実行";
}

// ─────────── メイン ───────────

async function main(): Promise<void> {
  const doWrite = process.argv.includes("--write");
  const today = todayJst();
  const jquantsOk = isJQuantsConfigured();

  console.log(`[backfill:special-outcomes] mode=${doWrite ? "WRITE" : "DRY-RUN"} jquants=${jquantsOk ? "ok" : "not_configured"}`);
  if (doWrite && !jquantsOk) {
    console.error("[ERROR] --write には J-Quants API が必要です。.env を確認してください。");
    process.exit(1);
  }
  if (doWrite) {
    console.log("[WARN] --write モードです。pnpm backup を事前に実行していることを確認してください。");
  }

  // 候補コード読み込み
  type CandidateEntry = { code: string; name: string };
  type Config = { candidates?: CandidateEntry[] };
  const config = readYaml<Config>("config/special-situation-watch-rules.yml");
  const candidates = config.candidates ?? [];
  const candidateCodes = new Set(candidates.map(c => c.code));
  const codeToName = new Map(candidates.map(c => [c.code, c.name]));

  // 既存 outcomes 読み込み
  const allOutcomes = readJsonl<HypothesisOutcome>(OUTCOME_PATH);

  // special_prefer: special_situation マーカーがある code はそちらを優先
  const allMatched = allOutcomes.filter(o => candidateCodes.has(o.code));
  const specialCodes = new Set(allMatched.filter(isSpecialSituationOutcome).map(o => o.code));
  const matchedOutcomes = allMatched.filter(o =>
    isSpecialSituationOutcome(o) || !specialCodes.has(o.code)
  );

  // 混在検出と警告
  const mixed = detectMixedOutcomes(allOutcomes, candidateCodes);
  if (mixed.length > 0) {
    console.log(`[backfill] 注意: ${mixed.length}銘柄で special/normal outcome が混在。special を優先して使用:`);
    for (const m of mixed) console.log(`  ${m.code}: special=${m.specialCount}, normal=${m.normalCount} → special のみを使用`);
  }

  // TOPIX 価格キャッシュ
  let topixQuotes: DailyQuote[] = [];
  if (jquantsOk && matchedOutcomes.length > 0) {
    try {
      const earliest = matchedOutcomes.reduce((min, o) => {
        const d = o.hypothesis.detectedAt;
        return d < min ? d : min;
      }, matchedOutcomes[0].hypothesis.detectedAt);
      console.log(`[backfill] TOPIX 価格取得: ${earliest} 〜 ${today}`);
      topixQuotes = await fetchDailyQuotes(TOPIX_ETF_CODE, toCompactDate(earliest), toCompactDate(today)) as DailyQuote[];
      await sleep(300);
    } catch (e) {
      console.warn(`[WARN] TOPIX 価格取得失敗: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 銘柄別価格キャッシュ
  const priceCache = new Map<string, DailyQuote[]>();

  // 分析
  const byCodeMap = new Map<string, BackfillByCode>();
  for (const c of candidates) {
    byCodeMap.set(c.code, { code: c.code, name: c.name, matchedOutcomes: 0, updatable: 0, updated: 0, skipped: 0, missingReasons: [], nextAction: "" });
  }

  const updatesPreview: UpdatePreview[] = [];
  const updatedOutcomes: HypothesisOutcome[] = [];
  const notes: string[] = [];

  let totalNotDueYet = 0;
  let totalMissingResult = 0;
  let totalMissing1w = 0;
  let totalMissing1m = 0;
  let totalMissingTopix = 0;
  let notDueYet1w = 0;
  let notDueYet1m = 0;

  for (const outcome of matchedOutcomes) {
    const row = byCodeMap.get(outcome.code)!;
    row.matchedOutcomes++;
    const detectedAt = outcome.hypothesis.detectedAt;
    const horizon = outcome.reviewHorizon;

    // 各フィールドの状態確認
    const missingResult = outcome.result === "unknown";
    const hasReturn1w = outcome.return1w != null && Number.isFinite(outcome.return1w);
    const hasReturn1m = outcome.return1m != null && Number.isFinite(outcome.return1m);
    const hasTopix = outcome.relativeToTopix1m != null && Number.isFinite(outcome.relativeToTopix1m);

    const due1w = !isNotDueYet(detectedAt, "1w", today);
    const due1m = !isNotDueYet(detectedAt, "1m", today);

    if (!due1w) notDueYet1w++;
    if (!due1m) notDueYet1m++;
    if (missingResult) totalMissingResult++;
    if (!hasReturn1w && due1w) totalMissing1w++;
    if (!hasReturn1m && due1m) totalMissing1m++;
    if (!hasTopix && due1m) totalMissingTopix++;

    // 何を埋められるか
    const fieldsToFill: string[] = [];
    const reasons: string[] = [];
    const outcomeKey = `${outcome.code}:${detectedAt}:${horizon}`;

    if (!jquantsOk) {
      reasons.push("jquants_not_configured");
      row.missingReasons.push("jquants_not_configured");
    } else {
      // 価格取得 (dry-run でも取得して「補完できるか」を正確に分析)
      if (!priceCache.has(outcome.code)) {
        try {
          console.log(`[backfill] 価格取得: ${outcome.code} ${detectedAt}`);
          const q = await fetchDailyQuotes(outcome.code, toCompactDate(detectedAt), toCompactDate(today)) as DailyQuote[];
          priceCache.set(outcome.code, q);
          await sleep(300);
        } catch (e) {
          console.warn(`[WARN] ${outcome.code} 価格取得失敗: ${e instanceof Error ? e.message : e}`);
          priceCache.set(outcome.code, []);
        }
      }
      const stockQuotes = priceCache.get(outcome.code) ?? [];

      const stockQuotesForAnalysis = priceCache.get(outcome.code) ?? stockQuotes;
      const ret = stockQuotesForAnalysis.length > 0 ? buildReturnData(stockQuotesForAnalysis, detectedAt) : null;
      const topixRet = topixQuotes.length > 0 ? buildReturnData(topixQuotes, detectedAt) : null;

      // result
      if (missingResult && horizon !== "1w" && horizon !== "1m" && horizon !== "3m") {
        // 1d の場合は ret1d で判断
        if (ret?.ret1d != null) {
          fieldsToFill.push("result");
        } else if (ret?.base == null) {
          reasons.push("price_at_detectedAt_missing");
          row.missingReasons.push("price_at_detectedAt_missing");
        } else {
          reasons.push("price_1d_missing");
          row.missingReasons.push("price_1d_missing");
        }
      } else if (missingResult) {
        // 1w/1m/3m
        const due = !isNotDueYet(detectedAt, horizon, today);
        if (!due) {
          reasons.push("not_due_yet");
          row.missingReasons.push("not_due_yet");
          totalNotDueYet++;
        } else if (ret != null) {
          fieldsToFill.push("result");
        }
      }

      // return1w
      if (!hasReturn1w) {
        if (!due1w) {
          reasons.push("not_due_yet");
          if (!row.missingReasons.includes("not_due_yet")) row.missingReasons.push("not_due_yet");
        } else if (ret?.ret1w != null) {
          fieldsToFill.push("return1w");
        } else {
          reasons.push("price_1w_missing");
          if (!row.missingReasons.includes("price_1w_missing")) row.missingReasons.push("price_1w_missing");
        }
      }

      // return1m
      if (!hasReturn1m) {
        if (!due1m) {
          if (!reasons.includes("not_due_yet")) reasons.push("not_due_yet");
          if (!row.missingReasons.includes("not_due_yet")) row.missingReasons.push("not_due_yet");
        } else if (ret?.ret1m != null) {
          fieldsToFill.push("return1m");
        } else {
          reasons.push("price_1m_missing");
          if (!row.missingReasons.includes("price_1m_missing")) row.missingReasons.push("price_1m_missing");
        }
      }

      // topixRelative1m
      if (!hasTopix) {
        if (!due1m) {
          if (!reasons.includes("not_due_yet")) reasons.push("not_due_yet");
        } else if (ret?.ret1m != null && topixRet?.ret1m != null) {
          fieldsToFill.push("relativeToTopix1m");
        } else {
          reasons.push("topix_price_missing");
          if (!row.missingReasons.includes("topix_price_missing")) row.missingReasons.push("topix_price_missing");
        }
      }
    }

    const canUpdate = fieldsToFill.length > 0;
    const preview: UpdatePreview = {
      code: outcome.code,
      outcomeKey,
      fieldsToFill,
      reason: canUpdate ? `${fieldsToFill.join("/")} を補完可能` : reasons[0] ?? "already_filled",
      willWrite: doWrite && canUpdate,
    };
    updatesPreview.push(preview);

    if (canUpdate) {
      row.updatable++;
      if (doWrite) {
        // 実際に更新
        const stockQuotes = priceCache.get(outcome.code) ?? [];
        const ret = stockQuotes.length > 0 ? buildReturnData(stockQuotes, outcome.hypothesis.detectedAt) : null;
        const topixRet = topixQuotes.length > 0 ? buildReturnData(topixQuotes, outcome.hypothesis.detectedAt) : null;
        const updated = { ...outcome };
        if (fieldsToFill.includes("return1w") && ret?.ret1w != null) updated.return1w = ret.ret1w;
        if (fieldsToFill.includes("return1m") && ret?.ret1m != null) updated.return1m = ret.ret1m;
        if (fieldsToFill.includes("relativeToTopix1m") && ret?.ret1m != null && topixRet?.ret1m != null) {
          updated.relativeToTopix1m = ret.ret1m - topixRet.ret1m;
        }
        if (fieldsToFill.includes("result")) {
          // 1d のリターンで仮判定
          const retForHorizon = horizon === "1d" ? ret?.ret1d :
            horizon === "1w" ? ret?.ret1w :
            horizon === "3m" ? ret?.ret1m : ret?.ret1m;
          if (retForHorizon != null) {
            const THRESHOLD = 3;
            const dir = outcome.hypothesis.expectedDirection ?? "up";
            updated.result = dir === "up"
              ? retForHorizon >= THRESHOLD ? "hit" : retForHorizon >= -THRESHOLD ? "too_early" : "miss"
              : retForHorizon <= -THRESHOLD ? "hit" : "too_early";
          }
        }
        updatedOutcomes.push(updated);
        row.updated++;
      }
    } else {
      row.skipped++;
    }
  }

  // missingReasons 重複除去 + nextAction 確定
  for (const row of byCodeMap.values()) {
    row.missingReasons = [...new Set(row.missingReasons)];
    row.nextAction = nextActionFor(row);
  }

  // --write の場合は JSONL を更新
  if (doWrite && updatedOutcomes.length > 0) {
    const updatedKeys = new Set(updatedOutcomes.map(o => `${o.code}:${o.hypothesis.detectedAt}:${o.reviewHorizon}`));
    const unchanged = allOutcomes.filter(o => !updatedKeys.has(`${o.code}:${o.hypothesis.detectedAt}:${o.reviewHorizon}`));
    const merged = [...unchanged, ...updatedOutcomes];
    writeFileSync(OUTCOME_PATH, merged.map(o => JSON.stringify(o)).join("\n") + "\n", "utf-8");
    console.log(`[write] ${updatedOutcomes.length}件を更新しました (total: ${merged.length}件)`);
    notes.push(`--write: ${updatedOutcomes.length}件を更新。data/hypothesis_outcomes.jsonl を上書き。`);
  } else if (doWrite) {
    console.log("[write] 更新対象がありませんでした。");
  }

  if (!jquantsOk) {
    notes.push("J-Quants が設定されていません。.env に JQUANTS_REFRESH_TOKEN を設定すると価格データを取得できます。");
  }
  if (mixed.length > 0) {
    notes.push(`[special_prefer] ${mixed.map(m => m.code).join("/")} で special/normal 混在を検出。special outcome を優先しました。`);
  }
  if (notDueYet1w > 0) {
    notes.push(`return1w は ${notDueYet1w}件が期限未到来 (detectedAt+7日後以降に再実行)。`);
  }
  if (notDueYet1m > 0) {
    notes.push(`return1m は ${notDueYet1m}件が期限未到来 (detectedAt+30日後以降に再実行)。`);
  }
  notes.push("outcomeStats が null の場合、データ不足であり仕組みの問題ではありません。");
  notes.push("※売買推奨ではありません。検証データ整備のためのレポートです。");

  const totalUpdatable = updatesPreview.filter(u => u.fieldsToFill.length > 0).length;
  const totalUpdated = doWrite ? updatedOutcomes.length : 0;

  const report: SpecialSituationOutcomeBackfillReport = {
    generatedAt: today,
    dryRun: !doWrite,
    summary: {
      candidates: candidates.length,
      matchedOutcomes: matchedOutcomes.length,
      updatableOutcomes: totalUpdatable,
      updatedOutcomes: totalUpdated,
      skippedOutcomes: matchedOutcomes.length - totalUpdatable,
      notDueYet: notDueYet1w + notDueYet1m,
    },
    missing: {
      result: totalMissingResult,
      return1w: totalMissing1w,
      return1m: totalMissing1m,
      topixRelative1m: totalMissingTopix,
    },
    notDueYet: {
      return1w: notDueYet1w,
      return1m: notDueYet1m,
    },
    byCode: [...byCodeMap.values()],
    updatesPreview,
    notes,
  };

  // レポート出力
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, "special_situation_outcome_backfill_latest.json"), JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(join(REPORT_DIR, "special_situation_outcome_backfill_latest.md"), renderMarkdown(report), "utf-8");

  console.log(`\n=== backfill summary ===`);
  console.log(`candidates: ${report.summary.candidates}`);
  console.log(`matchedOutcomes: ${report.summary.matchedOutcomes}`);
  console.log(`updatableOutcomes: ${report.summary.updatableOutcomes}`);
  console.log(`updatedOutcomes: ${report.summary.updatedOutcomes}`);
  console.log(`notDueYet: ${report.summary.notDueYet}`);
  console.log(`missing.result: ${report.missing.result}`);
  console.log(`missing.return1w (due): ${report.missing.return1w}`);
  console.log(`missing.return1m (due): ${report.missing.return1m}`);
  console.log(`notDueYet.return1w: ${report.notDueYet.return1w}`);
  console.log(`notDueYet.return1m: ${report.notDueYet.return1m}`);
  if (!doWrite) {
    console.log("\ndry-run: data/hypothesis_outcomes.jsonl は変更されていません。");
    console.log("--write で実行する場合は先に pnpm backup を実行してください。");
  }
}

function renderMarkdown(report: SpecialSituationOutcomeBackfillReport): string {
  const lines: string[] = [];
  lines.push("# 特殊状況 outcome backfill レポート", "");
  lines.push(`date: ${report.generatedAt}`, "");
  lines.push(`dryRun: ${report.dryRun}`, "");
  lines.push("> ※売買推奨ではありません。検証データ整備のためのレポートです。", "");

  lines.push("## summary", "");
  lines.push("| item | count |");
  lines.push("|---|---:|");
  lines.push(`| candidates | ${report.summary.candidates} |`);
  lines.push(`| matchedOutcomes | ${report.summary.matchedOutcomes} |`);
  lines.push(`| updatableOutcomes | ${report.summary.updatableOutcomes} |`);
  lines.push(`| updatedOutcomes | ${report.summary.updatedOutcomes} |`);
  lines.push(`| skippedOutcomes | ${report.summary.skippedOutcomes} |`);
  lines.push(`| notDueYet (合計) | ${report.summary.notDueYet} |`);
  lines.push("");

  lines.push("## missing / not due yet", "");
  lines.push("| field | missing (due) | not_due_yet |");
  lines.push("|---|---:|---:|");
  lines.push(`| result | ${report.missing.result} | - |`);
  lines.push(`| return1w | ${report.missing.return1w} | ${report.notDueYet.return1w} |`);
  lines.push(`| return1m | ${report.missing.return1m} | ${report.notDueYet.return1m} |`);
  lines.push(`| topixRelative1m | ${report.missing.topixRelative1m} | - |`);
  lines.push("");

  lines.push("## by code", "");
  lines.push("| code | name | matched | updatable | updated | skipped | nextAction |");
  lines.push("|---|---|---:|---:|---:|---:|---|");
  for (const row of report.byCode) {
    lines.push(`| ${row.code} | ${row.name} | ${row.matchedOutcomes} | ${row.updatable} | ${row.updated} | ${row.skipped} | ${row.nextAction} |`);
  }
  lines.push("");

  lines.push("## updates preview", "");
  const showable = report.updatesPreview.filter(u => u.fieldsToFill.length > 0 || u.reason !== "already_filled");
  if (showable.length === 0) {
    lines.push("- 補完可能な項目はありません（全て not_due_yet または already_filled）");
  } else {
    lines.push("| code | outcomeKey | fields | reason | willWrite |");
    lines.push("|---|---|---|---|---|");
    for (const u of showable.slice(0, 20)) {
      const fields = u.fieldsToFill.join(", ") || "-";
      lines.push(`| ${u.code} | ${u.outcomeKey} | ${fields} | ${u.reason} | ${u.willWrite} |`);
    }
  }
  lines.push("");

  if (report.notes.length > 0) {
    lines.push("## notes", "");
    for (const note of report.notes) lines.push(`- ${note}`);
    lines.push("");
  }

  lines.push("## 次のアクション", "");
  lines.push("```");
  lines.push("1. pnpm watch:special                     # outcomeCoverageAudit で不足を確認");
  lines.push("2. pnpm backfill:special-outcomes         # dry-run で安全確認");
  lines.push("3. pnpm backup                            # バックアップを取る");
  lines.push("4. pnpm backfill:special-outcomes --write # 価格取得・補完実行");
  lines.push("5. pnpm watch:special                     # outcomeStats を再確認");
  lines.push("```");
  lines.push("");
  lines.push(`*special situation outcome backfill | ${report.generatedAt} | ※売買推奨ではありません*`);
  return lines.join("\n");
}

main().catch(err => {
  console.error("[ERROR]", err);
  process.exit(1);
});
