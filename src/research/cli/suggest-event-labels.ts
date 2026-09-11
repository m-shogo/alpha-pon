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
  listArchivedEdinetDates,
  readArchivedEdinetDocuments,
} from "../../edinet-document-archive.js";
import {
  edinetEvidence,
  tdnetEvidence,
  type LabelEvidence,
} from "../signals/label-evidence.js";
import {
  matchRuleForTitle,
  suggestLabel,
} from "../signals/disclosure-label-suggestions.js";
import { detectAbnormalMoveEvents } from "../signals/abnormal-move-events.js";
import { DEFAULT_MARKET_MODEL_PARAMS } from "../signals/market-model.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadEarningsEventDatesFromStore,
  loadStudyInputsFromStore,
} from "../study-inputs-from-store.js";
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

/**
 * 証拠を2系統から集める。
 *
 * TDnet は 2026-08-03 以降しか無いが見出しが日本語で読める。
 * EDINET は価格のある期間を丸ごとカバーし、臨時報告書の事由コードを持つ。
 * **どちらか片方だけでは、価格のある期間のラベルが揃わない。**
 */
function loadEvidence(from?: string, to?: string): LabelEvidence[] {
  const evidence: LabelEvidence[] = [];
  for (const row of loadArchive(from, to)) {
    const one = tdnetEvidence(row);
    if (one) evidence.push(one);
  }
  for (const date of listArchivedEdinetDates()) {
    if (from && date < from) continue;
    if (to && date > to) continue;
    for (const row of readArchivedEdinetDocuments(date)) {
      const one = edinetEvidence(row);
      if (one) evidence.push(one);
    }
  }
  return evidence;
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
  if (hasFlag("preview-rules")) {
    const rows = loadArchive(from, to);
    if (rows.length === 0) {
      console.log("保存済みの TDnet 開示がない。先に pnpm archive:tdnet を実行すること。");
      process.exitCode = 1;
      return;
    }
    previewRules(rows);
    return;
  }

  const evidence = loadEvidence(from, to);
  if (evidence.length === 0) {
    console.log("証拠がない。pnpm archive:tdnet / pnpm archive:edinet を先に実行すること。");
    process.exitCode = 1;
    return;
  }

  // 価格側の候補を作って突き合わせる。
  //
  // 材料（流動性の足切り・ユニバース benchmark・権利落ち台帳）は
  // edge-study / backtest と**同じ関数**から取る。ここだけ別に組むと、
  // 「イベントスタディには出たのにラベル提案には出ない」の原因が分からなくなる。
  const minTurnoverJpy = Number(argValue("min-turnover-jpy") ?? 500_000_000);
  if (!Number.isFinite(minTurnoverJpy) || minTurnoverJpy < 0) {
    console.error("--min-turnover-jpy は0以上の数値で指定してください");
    process.exitCode = 1;
    return;
  }
  let inputs;
  try {
    inputs = loadStudyInputsFromStore({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      minTurnoverJpy,
    });
  } catch (error) {
    if (error instanceof StudyInputsError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const archiveDates = evidence.map((one) => one.observationDate).sort();
  const priceTo = inputs.prices
    .flatMap((series) => series.bars.map((bar) => bar.date))
    .sort()
    .at(-1) ?? null;
  const archiveFrom = archiveDates[0] ?? null;

  const bySource = new Map<string, number>();
  for (const one of evidence) bySource.set(one.source, (bySource.get(one.source) ?? 0) + 1);
  console.log(
    `証拠 ${evidence.length}件（${archiveFrom} 〜 ${archiveDates.at(-1)}）`
    + ` / ${[...bySource].map(([source, count]) => `${source} ${count}`).join(" ")}`,
  );
  for (const line of formatStudyInputs(inputs, minTurnoverJpy)) console.log(line);

  if (priceTo && archiveFrom && priceTo < archiveFrom) {
    console.log("");
    console.log("価格と開示の期間が重なっていない。");
    console.log(`  価格の上限   ${priceTo}（J-Quants Free は84日遅延）`);
    console.log(`  開示の開始   ${archiveFrom}`);
    console.log("重なるまで突き合わせはできない。--preview-rules でルールの下見はできる。");
    return;
  }

  // 決算開示から「説明のつく日」を組む。空の Map は「情報が無い」の意味なので、
  // 黙って空のまま走らせない（`--no-earnings-calendar` で明示的に外せる）。
  let knownEventDates = new Map<string, Set<string>>();
  if (hasFlag("no-earnings-calendar")) {
    console.log("注意: --no-earnings-calendar。決算反応も候補に混ざる");
  } else {
    const earnings = loadEarningsEventDatesFromStore({ tradingDates: inputs.tradingDates });
    knownEventDates = earnings.byCode;
    console.log(
      `決算カレンダー: ${earnings.datesScanned}営業日 / 開示 ${earnings.disclosureCount.toLocaleString()}件`
      + ` → ${earnings.byCode.size}銘柄 / 除外対象 ${earnings.markedDates.toLocaleString()}日`,
    );
  }

  const detected = detectAbnormalMoveEvents(inputs.prices, inputs.benchmark, {
    abnormalReturnThresholdPct: Number(argValue("threshold-pct") ?? -10),
    knownEventDates,
    corporateActionDates: inputs.corporateActionDates,
    marketModel: DEFAULT_MARKET_MODEL_PARAMS,
    minAverageTurnoverJpy: minTurnoverJpy,
  });

  // 却下の内訳を必ず出す。これが無いと「候補0件」の理由が
  // 「異常が無かった」なのか「測れなかった」なのか分からない。
  const rejectSummary = Object.entries(detected.rejectedCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");
  console.log(`検出  : 評価 ${detected.evaluatedCount} → 候補 ${detected.candidates.length}`);
  if (rejectSummary) console.log(`却下  : ${rejectSummary}`);
  const unavailable = detected.rejectedCounts.market_model_unavailable;
  if (detected.evaluatedCount > 0 && unavailable > detected.evaluatedCount * 0.5) {
    console.log(
      `⚠ 評価の ${(unavailable / detected.evaluatedCount * 100).toFixed(0)}% で市場モデルを推定できていません。`
      + "候補の少なさを結論にしないでください。"
      + `--from を早めて推定窓（${DEFAULT_MARKET_MODEL_PARAMS.estimationBars}本）ぶんの履歴を入れること`,
    );
  }
  console.log("");

  const byCode = new Map<string, LabelEvidence[]>();
  for (const one of evidence) {
    const bucket = byCode.get(one.code) ?? [];
    bucket.push(one);
    byCode.set(one.code, bucket);
  }

  let suggested = 0;
  let conflicting = 0;
  let noDisclosure = 0;
  for (const candidate of detected.candidates) {
    const suggestion = suggestLabel({
      candidateId: candidate.candidateId,
      code: candidate.code,
      date: candidate.date,
      evidence: byCode.get(candidate.code) ?? [],
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
