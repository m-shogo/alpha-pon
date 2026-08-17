// ユニバース候補の仮説生成
// scan-stock-universe.ts が生成した候補をもとに仮説を自動生成する
// pnpm candidate:hypothesis
//
// 注意: 買い推奨ではない。仮説は「監視候補」「検証候補」「反証待ち」の分類で管理する。

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst, addDaysJst } from "./date.js";
import {
  normalizeStockCandidateWatchlistCodes,
  parseExistingStockCandidateHypothesesJsonl,
} from "./stock-candidate-hypothesis-input.js";
import type {
  UniverseCandidate,
  StockCandidateHypothesis,
  HypothesisTimeframe,
  HypothesisLabel,
} from "./universe.js";

// ── 既存仮説の読み込み ─────────────────────────────────────────

const HYPOTHESIS_PATH = "data/hypothesis_predictions.jsonl";

function readExistingHypotheses(): StockCandidateHypothesis[] {
  if (!existsSync(HYPOTHESIS_PATH)) return [];
  const parsed = parseExistingStockCandidateHypothesesJsonl(
    readFileSync(HYPOTHESIS_PATH, "utf-8"),
    HYPOTHESIS_PATH,
  );
  for (const warning of parsed.warnings) {
    console.warn(`[warning] ${warning}`);
  }
  return parsed.rows;
}

function appendHypothesis(h: StockCandidateHypothesis): void {
  appendFileSync(HYPOTHESIS_PATH, JSON.stringify(h) + "\n", "utf-8");
}

// ── 重複チェック ──────────────────────────────────────────────

function isDuplicate(
  existing: StockCandidateHypothesis[],
  code: string,
  detectedAt: string
): boolean {
  return existing.some(
    h => h.code === code && h.detectedAt === detectedAt && h.status === "open"
  );
}

// ── watchlist 読み込み（登録済みかの確認用） ──────────────────

function loadWatchlistCodes(): Set<string> {
  const path = "config/watchlist.yml";
  if (!existsSync(path)) return new Set();
  const normalized = normalizeStockCandidateWatchlistCodes(load(readFileSync(path, "utf-8")), path);
  for (const warning of normalized.warnings) {
    console.warn(`[warning] ${warning}`);
  }
  return normalized.codes;
}

// ── 仮説生成 ─────────────────────────────────────────────────

function resolveTimeframe(drawdownPct: number | null, score: number): HypothesisTimeframe {
  if (score >= 70) return "1m";
  if (drawdownPct != null && drawdownPct <= -25) return "3m"; // 深い調整は長期
  return "1m";
}

function resolveLabel(score: number, matchedTags: string[]): HypothesisLabel {
  if (score >= 70 && matchedTags.length >= 2) return "検証候補";
  if (score >= 55) return "監視候補";
  return "反証待ち";
}

function buildInvalidationSignals(candidate: UniverseCandidate): string[] {
  const signals: string[] = [
    "下方修正の開示",
    "監査意見の変更・限定付き意見",
    "不正・コンプライアンス問題の開示",
    "主力事業の契約解除・大口顧客離れ",
  ];

  if (candidate.matchedWorldEventTags.includes("war_geopolitics")) {
    signals.push("防衛予算の大幅削減・安保政策の転換");
  }
  if (candidate.matchedWorldEventTags.includes("ai_compute")) {
    signals.push("AIサイクルの急速な冷え込み");
  }
  if (candidate.matchedWorldEventTags.includes("climate_heat_water")) {
    signals.push("気候対策政策の後退・補助金削減");
  }

  return signals;
}

function buildEvidenceNeeded(candidate: UniverseCandidate): string[] {
  const evidence: string[] = [
    "直近の決算短信・業績進捗確認",
    "有価証券報告書のリスクファクター確認",
    "大株主構成と保有比率の変化",
    "アナリストコンセンサスと乖離の確認",
  ];

  if (candidate.sector === "defense_space") {
    evidence.push("防衛省・政府調達の受注動向");
  }
  if (candidate.sector === "semiconductor") {
    evidence.push("半導体市況サイクルの現在地");
    evidence.push("受注残・在庫水準の確認");
  }
  if (candidate.sector === "automation_robotics") {
    evidence.push("中国・アジア向け受注の動向");
  }
  if (candidate.sector === "healthcare") {
    evidence.push("開発パイプラインのフェーズ確認");
  }

  return evidence;
}

function generateHypothesis(
  candidate: UniverseCandidate,
  watchlistCodes: Set<string>
): StockCandidateHypothesis {
  const date = todayJst();
  const timeframe = resolveTimeframe(candidate.drawdownPct, candidate.screeningScore);
  const label = resolveLabel(candidate.screeningScore, candidate.matchedWorldEventTags);

  // reviewDueAt: timeframe に応じた日付
  const daysMap: Record<HypothesisTimeframe, number> = {
    "1w": 7,
    "1m": 30,
    "3m": 90,
  };
  const reviewDueAt = addDaysJst(date, daysMap[timeframe]);

  const isRegistered = watchlistCodes.has(candidate.code);
  const reasonPrefix = isRegistered
    ? "watchlist登録銘柄でも自動シグナルを検出: "
    : "未登録銘柄の自動検出: ";

  const drawdownText = candidate.drawdownPct != null
    ? `高値比${Math.abs(candidate.drawdownPct).toFixed(1)}%下落`
    : "価格データ不足";

  const yoyText = candidate.operatingProfitYoY != null
    ? `営業利益前年比+${candidate.operatingProfitYoY.toFixed(1)}%`
    : "財務データ不足";

  const reason =
    `${reasonPrefix}${drawdownText}、${yoyText}。` +
    (candidate.matchedWorldEventTags.length > 0
      ? `世界情勢テーマ: ${candidate.matchedWorldEventTags.join("・")}。`
      : "");

  return {
    schemaVersion: 1,
    code: candidate.code,
    name: candidate.name,
    detectedAt: date,
    reviewDueAt,
    reason,
    expectedTimeframe: timeframe,
    expectedDirection: "unknown",
    confidence: Math.min(0.9, candidate.screeningScore / 100),
    invalidationSignals: buildInvalidationSignals(candidate),
    evidenceNeeded: buildEvidenceNeeded(candidate),
    relatedWorldEventIds: candidate.matchedWorldEventTags,
    relatedDisclosureIds: [],
    status: "open",
    label,
  };
}

// ── メイン ────────────────────────────────────────────────────

function main(): void {
  console.log("=== 仮説生成開始 ===");

  const latestPath = "data/universe_candidates_latest.json";
  if (!existsSync(latestPath)) {
    console.error("[error] universe_candidates_latest.json が見つかりません。先に scan:universe を実行してください。");
    process.exit(1);
  }

  const rawData = JSON.parse(readFileSync(latestPath, "utf-8")) as {
    generatedAt?: string;
    candidates: UniverseCandidate[];
  };

  // stale data チェック: generatedAt が今日でなければ古いデータなのでエラー終了
  const today = todayJst();
  if (rawData.generatedAt !== today) {
    console.error(
      `[error] universe_candidates_latest.json が古いです。` +
      `generatedAt=${rawData.generatedAt ?? "unknown"}, today=${today}\n` +
      `  scan:universe が正常終了した後に candidate:hypothesis を実行してください。`
    );
    process.exit(1);
  }

  const candidates = rawData.candidates ?? [];
  console.log(`候補数: ${candidates.length} (generatedAt: ${rawData.generatedAt})`);

  const existing = readExistingHypotheses();
  const watchlistCodes = loadWatchlistCodes();

  let added = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    if (isDuplicate(existing, candidate.code, candidate.detectedAt)) {
      console.log(`  [skip] ${candidate.code} ${candidate.name}: 同日の仮説が既存`);
      skipped++;
      continue;
    }

    const hypothesis = generateHypothesis(candidate, watchlistCodes);
    appendHypothesis(hypothesis);
    console.log(`  [add] ${candidate.code} ${candidate.name} (${hypothesis.label})`);
    added++;
  }

  console.log(`\n追加: ${added}件 / スキップ: ${skipped}件`);
  console.log(`保存先: ${HYPOTHESIS_PATH}`);
  console.log("=== 完了 ===");
}

main();
