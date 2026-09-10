/**
 * 価格イベント候補に TDnet 開示を突き合わせ、ラベルの**提案**を出す。
 *
 *   pnpm label:suggest -- --from 2026-08-03 --to 2026-09-10   # 突き合わせ
 *   pnpm label:suggest -- --preview-rules                     # ルールの下見
 *
 * ## 確定はしない
 *
 * 出力は人が確認するための一覧。`research/event_labels.jsonl` へは書かない。
 * 見出しの単語一致で確定させると、`event-labels.ts` が一次情報の URL を
 * 必須にしている意味が無くなる。とくに misconduct と earnings の切り分けは
 * 「不適切な会計処理」のような見出しでは決まらない。
 *
 * ## `--preview-rules`
 *
 * 保存済みの開示にルールを当てて、何がどう分類されるかだけ見る。
 * 価格との突き合わせをしないので、価格が84日遅延で追いつく前でも
 * ルールの当たり方を確かめられる。
 */

import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  listArchivedDates,
  readArchivedDisclosures,
  type ArchivedDisclosure,
} from "../../disclosure-archive.js";
import {
  matchRuleForTitle,
  suggestLabel,
} from "../signals/disclosure-label-suggestions.js";
import { detectAbnormalMoveEvents } from "../signals/abnormal-move-events.js";
import {
  DEFAULT_MARKET_MODEL_PARAMS,
} from "../signals/market-model.js";
import {
  DEFAULT_UNIVERSE_BENCHMARK_PARAMS,
  buildUniverseBenchmark,
} from "../signals/universe-benchmark.js";
import {
  JQUANTS_ADJUSTMENT_LEDGER_NAME,
  parseAdjustmentLedger,
  toCorporateActionDates,
} from "../providers/jquants-adjustment-events.js";
import {
  loadBacktestSeriesAsOf,
  resolveStoreRoot,
} from "../providers/jquants-daily-store.js";
import { TREATMENT_LABELS } from "../signals/event-labels.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function loadArchive(from?: string, to?: string): ArchivedDisclosure[] {
  const rows: ArchivedDisclosure[] = [];
  for (const date of listArchivedDates()) {
    if (from && date < from) continue;
    if (to && date > to) continue;
    rows.push(...readArchivedDisclosures(date));
  }
  return rows;
}

function previewRules(rows: ArchivedDisclosure[]): void {
  const byLabel = new Map<string, ArchivedDisclosure[]>();
  let unmatched = 0;
  for (const row of rows) {
    // 判定は matchRuleForTitle に集約する。ここで書き直すと共起条件が
    // 片方だけに入り、下見と本番でズレる。
    const rule = matchRuleForTitle(row.title);
    if (!rule) { unmatched += 1; continue; }
    const bucket = byLabel.get(rule.label) ?? [];
    bucket.push(row);
    byLabel.set(rule.label, bucket);
  }

  console.log(`開示 ${rows.length}件 / ${new Set(rows.map((row) => row.code)).size}社`);
  console.log("");
  for (const [label, matched] of [...byLabel.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const treatment = TREATMENT_LABELS.includes(label as never) ? " ← 研究対象" : "";
    console.log(`${label.padEnd(26)} ${String(matched.length).padStart(5)}件 / ${String(new Set(matched.map((row) => row.code)).size).padStart(4)}社${treatment}`);
    for (const row of matched.slice(0, 2)) {
      console.log(`    ${row.observationDate} ${row.code} ${row.title.slice(0, 50)}`);
    }
  }
  console.log(`${"（ルールに当たらない）".padEnd(22)} ${String(unmatched).padStart(5)}件`);
  console.log("");
  console.log("これはルールの下見。ラベルは確定していない。");
  console.log("とくに misconduct と earnings の切り分けは見出しでは決まらない。");
}

function main(): void {
  const from = argValue("from") ?? undefined;
  const to = argValue("to") ?? undefined;
  const rows = loadArchive(from, to);
  if (rows.length === 0) {
    console.log("保存済みの開示がない。先に pnpm archive:tdnet を実行すること。");
    process.exitCode = 1;
    return;
  }

  if (hasFlag("preview-rules")) {
    previewRules(rows);
    return;
  }

  // 価格側の候補を作って突き合わせる。
  const root = resolveStoreRoot();
  const ledgerPath = resolve(root, JQUANTS_ADJUSTMENT_LEDGER_NAME);
  if (!existsSync(ledgerPath)) {
    console.log("価格ストアがまだない。pnpm ingest:prices を先に実行すること。");
    console.log("開示だけ見るなら --preview-rules を使う。");
    process.exitCode = 1;
    return;
  }
  const corporateActionDates = toCorporateActionDates(
    parseAdjustmentLedger(readFileSync(ledgerPath, "utf-8")),
  );
  const loaded = loadBacktestSeriesAsOf({
    asOf: new Date().toISOString(),
    root,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  const priceDates = loaded.series.flatMap((series) => series.bars.map((bar) => bar.date));
  const archiveDates = rows.map((row) => row.observationDate);
  const priceTo = priceDates.length ? priceDates.sort().at(-1)! : null;
  const archiveFrom = archiveDates.length ? archiveDates.sort()[0]! : null;

  console.log(`開示 ${rows.length}件（${archiveFrom} 〜 ${archiveDates.sort().at(-1)}）`);
  console.log(`価格 ${loaded.series.length}銘柄（〜 ${priceTo}）`);

  if (priceTo && archiveFrom && priceTo < archiveFrom) {
    console.log("");
    console.log("価格と開示の期間が重なっていない。");
    console.log(`  価格の上限   ${priceTo}（J-Quants Free は84日遅延）`);
    console.log(`  開示の開始   ${archiveFrom}`);
    console.log("重なるまで突き合わせはできない。--preview-rules でルールの下見はできる。");
    return;
  }

  const universe = buildUniverseBenchmark(loaded.series, DEFAULT_UNIVERSE_BENCHMARK_PARAMS);
  const detected = detectAbnormalMoveEvents(loaded.series, universe.series, {
    abnormalReturnThresholdPct: Number(argValue("threshold-pct") ?? -10),
    knownEventDates: new Map(),
    corporateActionDates,
    marketModel: DEFAULT_MARKET_MODEL_PARAMS,
    minAverageTurnoverJpy: Number(argValue("min-turnover-jpy") ?? 500_000_000),
  });

  const byCode = new Map<string, ArchivedDisclosure[]>();
  for (const row of rows) {
    const bucket = byCode.get(row.code) ?? [];
    bucket.push(row);
    byCode.set(row.code, bucket);
  }

  console.log(`候補 ${detected.candidates.length}件`);
  console.log("");
  let suggested = 0;
  let conflicting = 0;
  let noDisclosure = 0;
  for (const candidate of detected.candidates) {
    // 保存庫の code は4桁、価格ストアは5桁。末尾の予備コードを落として合わせる。
    const shortCode = candidate.code.length === 5 && candidate.code.endsWith("0")
      ? candidate.code.slice(0, 4)
      : candidate.code;
    const suggestion = suggestLabel({
      candidateId: candidate.candidateId,
      code: shortCode,
      date: candidate.date,
      disclosures: byCode.get(shortCode) ?? [],
    });
    if (suggestion.conflicting) conflicting += 1;
    else if (suggestion.suggestedLabel) suggested += 1;
    else if (suggestion.matches.length === 0) noDisclosure += 1;

    console.log(
      `${candidate.date} ${candidate.code} ${candidate.abnormalReturnPct.toFixed(1)}%`
      + ` → ${suggestion.suggestedLabel ?? "（未確定）"}`,
    );
    console.log(`    ${suggestion.rationale}`);
    for (const url of suggestion.evidenceUrls.slice(0, 3)) console.log(`    ${url}`);
  }

  console.log("");
  console.log(`提案あり ${suggested} / 複数一致 ${conflicting} / 開示なし ${noDisclosure}`);
  console.log("確定は人が行う。research/event_labels.jsonl へは書かない。");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
