// pnpm evaluate:world-impact
// 期日が到来した世界ニュース影響仮説 outcome を、価格・ベンチマークと照合して自動評価する。
//
// 使い方:
//   pnpm evaluate:world-impact                       → dry-run（何も書き換えない）
//   pnpm evaluate:world-impact --write               → JSONL / latest に保存
//   pnpm evaluate:world-impact --as-of 2026-06-13    → 評価基準日を指定
//   pnpm evaluate:world-impact --horizon 1w          → 1d|1w|1m|all で絞り込み
//   pnpm evaluate:world-impact --code 4661           → 銘柄で絞り込み
//
// 安全ルール:
//   - dry-run 既定。--write の時だけ保存する
//   - 同じ reviewKey + horizon の outcome は更新のみで二重作成しない
//   - 既存値（manualMissReason 含む）は上書きしない。欠損補完のみ
//   - J-Quants 提供遅延（84日）範囲内の期日は priceDataPending としてスキップ
//   - J-Quants 未設定時は評価を延期し、insufficient_data を書き込まない
//   - 遅延期間を過ぎても価格が無いものだけ insufficient_data にする（miss にしない）

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { fetchDailyQuotes, isJQuantsConfigured } from "./fetcher/jquants.js";
import {
  deriveReviewStatus,
  evaluateWorldImpactOutcome,
  isEvaluableOutcome,
  normalizeWorldImpactReview,
  type WorldEventImpactReview,
  type WorldImpactQuote,
} from "./world-impact.js";

const JSONL_PATH = join("data", "world_event_impacts.jsonl");
const LATEST_PATH = join("data", "world_event_impacts_latest.json");
const BENCHMARK_CODE = "1306"; // TOPIX 連動 ETF
const JQUANTS_DELAY_DAYS = Number(process.env.JQUANTS_V2_DATA_DELAY_DAYS ?? "84");

type Args = {
  write: boolean;
  asOf: string;
  horizon: "1d" | "1w" | "1m" | "all";
  code: string | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | null => {
    const eq = argv.find(a => a.startsWith(`--${name}=`));
    if (eq) return eq.split("=")[1] ?? null;
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("--")) return argv[idx + 1];
    return null;
  };
  const horizonRaw = get("horizon") ?? "all";
  const horizon = horizonRaw === "1d" || horizonRaw === "1w" || horizonRaw === "1m" ? horizonRaw : "all";
  const asOfRaw = get("as-of");
  return {
    write: argv.includes("--write"),
    asOf: asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : todayJst(),
    horizon,
    code: get("code"),
  };
}

function isoDate(value: string): string {
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value.slice(0, 10);
}

function toCompact(value: string): string {
  return value.replace(/-/g, "");
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchQuotes(code: string, from: string, to: string): Promise<WorldImpactQuote[]> {
  try {
    const raw = await fetchDailyQuotes(code, toCompact(from), toCompact(to)) as Array<{ Date: string; AdjustmentClose: number }>;
    return raw
      .filter(q => q && typeof q.Date === "string" && Number.isFinite(q.AdjustmentClose))
      .map(q => ({ date: isoDate(q.Date), close: q.AdjustmentClose }));
  } catch (e) {
    console.warn(`[WARN] ${code} 価格取得失敗: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

type LineEntry =
  | { kind: "review"; raw: string; review: WorldEventImpactReview }
  | { kind: "broken"; raw: string };

function readLatestReviewsSafe(path = LATEST_PATH): WorldEventImpactReview[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed as WorldEventImpactReview[] : [];
  } catch (error) {
    console.warn(`[WARN] latest JSON を読めませんでした。JSONL更新は継続します: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const { asOf } = args;
  const jquantsOk = isJQuantsConfigured();
  const priceDataCap = addDaysIso(asOf, -JQUANTS_DELAY_DAYS);

  console.log(`[evaluate:world-impact] mode=${args.write ? "WRITE" : "DRY-RUN"} asOf=${asOf} horizon=${args.horizon}${args.code ? ` code=${args.code}` : ""} jquants=${jquantsOk ? "ok" : "not_configured"}`);

  // JSONL を行単位で保持（破損行・非対象行はそのまま保つ）
  const lines = existsSync(JSONL_PATH)
    ? readFileSync(JSONL_PATH, "utf-8").split("\n").filter(line => line.trim())
    : [];
  const entries: LineEntry[] = lines.map(raw => {
    try {
      return { kind: "review", raw, review: normalizeWorldImpactReview(JSON.parse(raw), asOf) };
    } catch {
      return { kind: "broken", raw };
    }
  });
  const reviews = entries.filter((e): e is Extract<LineEntry, { kind: "review" }> => e.kind === "review");

  // 評価対象の選定
  type Target = { entry: Extract<LineEntry, { kind: "review" }>; horizons: string[] };
  const targets: Target[] = [];
  let skippedPendingData = 0;
  for (const entry of reviews) {
    const review = entry.review;
    const code = review.affectedCompanyCodes[0];
    if (!code) continue;
    if (args.code && code !== args.code) continue;
    const horizons = review.outcomes
      .filter(outcome => args.horizon === "all" || outcome.horizon === args.horizon)
      .filter(outcome => isEvaluableOutcome(outcome, asOf))
      .filter(outcome => {
        // J-Quants 提供遅延の範囲内は価格が物理的に無いため待機（正常）
        if (outcome.dueAt > priceDataCap) {
          skippedPendingData++;
          return false;
        }
        return true;
      })
      .map(outcome => outcome.horizon);
    if (horizons.length > 0) targets.push({ entry, horizons });
  }

  const skippedMissingCredentials = !jquantsOk
    ? targets.reduce((sum, target) => sum + target.horizons.length, 0)
    : 0;

  console.log(`評価対象: ${targets.length}レビュー / 提供遅延待ちスキップ: ${skippedPendingData} outcome`);

  // 価格取得（銘柄ごとにキャッシュ・ベンチマークは1回）
  const quoteCache = new Map<string, WorldImpactQuote[]>();
  let benchmarkQuotes: WorldImpactQuote[] = [];
  if (jquantsOk && targets.length > 0) {
    const earliest = targets
      .map(t => t.entry.review.eventDate || t.entry.review.createdAt)
      .sort()[0];
    benchmarkQuotes = await fetchQuotes(BENCHMARK_CODE, earliest, asOf);
    for (const target of targets) {
      const code = target.entry.review.affectedCompanyCodes[0];
      if (quoteCache.has(code)) continue;
      const from = target.entry.review.eventDate || target.entry.review.createdAt;
      quoteCache.set(code, await fetchQuotes(code, from, asOf));
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } else if (!jquantsOk && targets.length > 0) {
    console.log("[INFO] J-Quants 未設定のため価格照合を延期します。設定不足を insufficient_data として保存しません。");
  }

  // 評価実行（既存 outcome の置き換えのみ。配列に追加しないため二重作成は構造的に起きない）
  type EvalSummary = { reviewKey: string; code: string; horizon: string; result: string | null; autoMissReason: string | null; note: string | null };
  const evaluations: EvalSummary[] = [];
  const updatedKeys = new Set<string>();
  for (const target of (jquantsOk ? targets : [])) {
    const review = target.entry.review;
    const code = review.affectedCompanyCodes[0];
    const quotes = quoteCache.get(code) ?? [];
    review.outcomes = review.outcomes.map(outcome => {
      if (!target.horizons.includes(outcome.horizon)) return outcome;
      const evaluated = evaluateWorldImpactOutcome({
        review,
        outcome,
        quotes,
        benchmarkQuotes,
        benchmarkCode: BENCHMARK_CODE,
        asOf,
      });
      if (evaluated.result !== outcome.result || evaluated.evaluatedAt !== outcome.evaluatedAt) {
        updatedKeys.add(review.reviewKey);
        evaluations.push({
          reviewKey: review.reviewKey,
          code,
          horizon: outcome.horizon,
          result: evaluated.result,
          autoMissReason: evaluated.autoMissReason,
          note: evaluated.evaluationNotes,
        });
      }
      return evaluated;
    });
    // reviewStatus は手動 skipped を尊重しつつ outcome から再導出
    if (review.reviewStatus !== "skipped") {
      review.reviewStatus = deriveReviewStatus(review.outcomes, asOf);
    }
  }

  // 保存（--write のみ）
  if (args.write && updatedKeys.size > 0) {
    const output = entries.map(entry =>
      entry.kind === "broken" || !updatedKeys.has(entry.review.reviewKey)
        ? entry.raw
        : JSON.stringify(entry.review)
    );
    writeFileSync(JSONL_PATH, output.join("\n") + "\n", "utf-8");

    // latest はマージ更新（dry-run 由来の候補レビューを消さない）
    const latest = readLatestReviewsSafe();
    const updatedByKey = new Map(reviews.filter(e => updatedKeys.has(e.review.reviewKey)).map(e => [e.review.reviewKey, e.review]));
    const mergedLatest = latest.map(item => updatedByKey.get(item.reviewKey) ?? item);
    for (const [key, review] of updatedByKey) {
      if (!mergedLatest.some(item => item.reviewKey === key)) mergedLatest.push(review);
    }
    writeFileSync(LATEST_PATH, JSON.stringify(mergedLatest, null, 2), "utf-8");
  }

  // レポート出力
  mkdirSync("reports", { recursive: true });
  const report = {
    schemaVersion: 1,
    generatedAt: todayJst(),
    asOf,
    mode: args.write ? "write" : "dry-run",
    horizon: args.horizon,
    code: args.code,
    jquantsConfigured: jquantsOk,
    targetReviews: targets.length,
    skippedPendingData,
    skippedMissingCredentials,
    evaluatedOutcomes: evaluations.length,
    updatedReviews: updatedKeys.size,
    evaluations,
    notes: [
      "価格データ不足は miss にせず insufficient_data として記録します。",
      "J-Quants 未設定時は価格照合を延期し、insufficient_data を保存しません。",
      "J-Quants 提供遅延の範囲内の期日は priceDataPending として待機します（正常）。",
      "manualMissReason は自動評価で上書きしません。",
      "売買の推奨は行いません。仮説検証のための観察記録です。",
    ],
  };
  writeFileSync(join("reports", "world-impact-evaluation.json"), JSON.stringify(report, null, 2) + "\n");

  console.log(`\n=== world impact evaluation (asOf=${asOf}) ===`);
  console.log(`mode: ${report.mode}`);
  console.log(`targetReviews: ${report.targetReviews}`);
  console.log(`evaluatedOutcomes: ${report.evaluatedOutcomes}`);
  console.log(`skippedPendingData: ${report.skippedPendingData}（価格データ提供待ち）`);
  console.log(`skippedMissingCredentials: ${report.skippedMissingCredentials}（J-Quants未設定）`);
  for (const item of evaluations.slice(0, 20)) {
    console.log(`  ${item.code} ${item.horizon}: ${item.result}${item.autoMissReason ? ` (autoMissReason=${item.autoMissReason})` : ""}`);
  }
  if (!args.write && evaluations.length > 0) {
    console.log("\ndry-run: 保存していません。--write で JSONL / latest に保存します。");
  }
  if (args.write && updatedKeys.size > 0) {
    console.log(`\n${updatedKeys.size}レビューを更新しました。`);
  }
  if (evaluations.length === 0) {
    console.log("評価対象なし（期日未到来、価格データ提供待ち、または J-Quants 未設定）。");
  }
  console.log("出力: reports/world-impact-evaluation.json");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
