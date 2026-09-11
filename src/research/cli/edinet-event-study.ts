/**
 * EDINET の臨時報告書を母集団にしたイベントスタディ。
 *
 *   pnpm research:edinet-study -- --reasons 第19条第2項第3号 \
 *     --from 2024-06-19 --to 2026-02-28 --intent="..."
 *
 * ## F1 と何が違うか
 *
 * F1 は「大きく下げた」ことを条件に候補を作る。こちらは**事由が起きた事実**
 * だけで母集団を作る。値動きの大きさは条件にしない。
 * 「子会社の異動が公表された銘柄はそのあとどう動くか」を直接測れる。
 *
 * ## 対照群を置かない
 *
 * `matched-controls` は「同じくらい下げた銘柄」を対照にする設計で、
 * 値動きを条件にしない母集団には使えない。ここでは市場モデルで
 * 市場要因を落としたうえで、帰無仮説「異常収益 = 0」を直接見る。
 *
 * 規模・業種でそろえた対照が要る段階になったら、その machinery を
 * 別に作ること。**いま無いものを有るふりで代用しない。**
 *
 * ## 出るのはコスト控除前
 *
 * research:backtest 側でコストを引くまで tradeable な期待値ではない。
 */

import { existsSync } from "node:fs";
import {
  listArchivedEdinetDates,
  readArchivedEdinetDocuments,
} from "../../edinet-document-archive.js";
import { edinetEvidence, type LabelEvidence } from "../signals/label-evidence.js";
import {
  buildEdinetReasonEvents,
  type EdinetReasonEvent,
} from "../signals/edinet-reason-events.js";
import { runEventStudy, type EventStudySubject } from "../signals/event-study.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadStudyInputsFromStore,
} from "../study-inputs-from-store.js";
import {
  computeDatasetFingerprint,
  DEFAULT_TRIALS_LEDGER_PATH,
  recordTrialOutcome,
  registerTrial,
} from "../trials-ledger.js";
import { fail, parseArgs } from "./common.js";

const DEFAULT_HORIZONS = [1, 5, 20, 60];

function bps(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}bps`;
}

function loadEdinetEvidence(from?: string, to?: string): LabelEvidence[] {
  const evidence: LabelEvidence[] = [];
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

function main(): void {
  const { flags, options } = parseArgs();
  const reasonsRaw = options.get("reasons");
  if (!reasonsRaw) fail("--reasons=<事由コード[,事由コード]> を指定してください");
  const reasonCodes = reasonsRaw!.split(",").map((one) => one.trim()).filter(Boolean);
  if (reasonCodes.length === 0) fail("--reasons が空です");

  const from = options.get("from");
  const to = options.get("to");
  const minTurnoverJpy = Number(options.get("min-turnover-jpy") ?? 500_000_000);
  if (!Number.isFinite(minTurnoverJpy) || minTurnoverJpy < 0) {
    fail("--min-turnover-jpy は0以上の数値で指定してください");
  }
  const useLedger = !flags.has("no-trial-ledger");
  const intent = options.get("intent");
  if (useLedger && !intent) {
    fail("--intent=\"この試行で何を確かめるか\" を指定してください（--no-trial-ledger で省略可）");
  }

  let inputs;
  try {
    inputs = loadStudyInputsFromStore({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      minTurnoverJpy,
    });
  } catch (error) {
    if (error instanceof StudyInputsError) fail(error.message);
    throw error;
  }
  for (const line of formatStudyInputs(inputs, minTurnoverJpy)) console.log(`⓪ ${line}`);

  // 反応日は価格ストアの営業日から決める。自前のカレンダーを持たない。
  const tradingDates = [...new Set(inputs.benchmark.bars.map((bar) => bar.date))].sort();
  const evidence = loadEdinetEvidence(from, to);
  if (evidence.length === 0) {
    fail("EDINET の保存が無い。pnpm archive:edinet を先に実行してください");
  }

  const built = buildEdinetReasonEvents({ evidence, reasonCodes, tradingDates });
  console.log(`① 事由         : ${reasonCodes.join(" / ")}`);
  console.log(
    `   EDINET 書類  ${built.evaluatedCount}件 → イベント ${built.events.length}件`
    + ` / ${new Set(built.events.map((one) => one.code)).size}社`,
  );
  const rejects = Object.entries(built.rejectedCounts)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");
  if (rejects) console.log(`   除外         ${rejects}`);

  // 流動性で絞ったユニバースの外は測れない（板が薄い銘柄の終値は
  // その日の市場変動を反映しない）。落ちた件数を出す。
  const tradable = new Set(inputs.prices.map((series) => series.code));
  const usable: EdinetReasonEvent[] = built.events.filter((one) => tradable.has(one.code));
  console.log(
    `   流動性で残る ${usable.length}件`
    + `（売買代金${(minTurnoverJpy / 1e8).toFixed(0)}億円/日以上の${inputs.prices.length}銘柄に限る）`,
  );
  if (usable.length === 0) fail("測れるイベントが0件です");

  const subjects: EventStudySubject[] = usable.map((one) => ({
    id: one.eventId,
    code: one.code,
    eventDate: one.reactionDate,
    group: "treatment",
    pairId: one.eventId,
  }));
  const securities = new Map(inputs.prices.map((series) => [series.code, series]));
  const study = runEventStudy(subjects, securities, inputs.benchmark, { horizons: DEFAULT_HORIZONS });

  console.log(`② イベントスタディ: 対象 ${study.subjectCount} → 観測 ${study.observations.length}`);
  if (study.skipped.length > 0) {
    const counts = new Map<string, number>();
    for (const one of study.skipped) counts.set(one.reason, (counts.get(one.reason) ?? 0) + 1);
    console.log(`   測れず       ${[...counts].map(([r, c]) => `${r}=${c}`).join(" ")}`);
  }
  console.log("");
  console.log("horizon |    n / クラスタ平均 / clusters / t(補正) | 回復率");
  for (const row of study.summaryByHorizon) {
    const t = row.treatment;
    console.log(
      `D+${String(row.horizonBars).padEnd(4)}`
      + `| ${String(t.count).padStart(4)} / `
      + `${t.clusteredMeanNetAlphaBps === null ? "      n/a" : bps(t.clusteredMeanNetAlphaBps).padStart(10)} / `
      + `${String(t.clusterCount ?? 0).padStart(3)} / `
      + `${t.clusteredTStat === null ? "  n/a" : t.clusteredTStat.toFixed(2).padStart(5)} `
      + `| ${row.treatmentReclaimRate === null ? "n/a" : `${(row.treatmentReclaimRate * 100).toFixed(0)}%`}`,
    );
  }
  console.log("");
  console.log("※ 対照群なし。帰無仮説は「市場モデル調整後の異常収益 = 0」。");
  console.log("※ コスト控除前。tradeable な期待値ではない。");

  if (!useLedger) return;
  const ledgerPath = options.get("trials-ledger") ?? DEFAULT_TRIALS_LEDGER_PATH;
  const edgeId = `edinet-reason:${reasonCodes.join("+")}`;
  const registered = registerTrial(
    {
      edgeId,
      specId: "edinet-reason-event-study-v1",
      params: {
        reasonCodes: [...reasonCodes].sort(),
        horizons: DEFAULT_HORIZONS,
        minTurnoverJpy,
        from: from ?? null,
        to: to ?? null,
      },
      datasetFingerprint: computeDatasetFingerprint({
        signalIds: subjects.map((one) => one.id),
        priceCodes: inputs.prices.map((series) => series.code),
        benchmarkCode: inputs.benchmark.code,
        asOf: subjects.map((one) => one.eventDate).sort().at(-1) ?? "",
      }),
      intent: intent!,
    },
    ledgerPath,
  );
  const longest = study.summaryByHorizon.at(-1);
  recordTrialOutcome(
    registered.trialId,
    {
      executedCount: longest?.treatment.count ?? 0,
      meanNetAlphaBps: longest?.treatment.clusteredMeanNetAlphaBps ?? 0,
      clusterCount: longest?.treatment.clusterCount ?? null,
      tStat: longest?.treatment.tStat ?? null,
      clusteredTStat: longest?.treatment.clusteredTStat ?? null,
    },
    ledgerPath,
      new Date(),
      // 測定のコードを直して測り直したときだけ、理由つきで置き換える。
      // 省略すると「同じ試行で違う結果」は落ちる（非決定性の検出）。
      { ...(options.get("supersede") ? { supersedesReason: options.get("supersede")! } : {}) },
  );
  console.log(`試行として記録: ${registered.trialId}（${edgeId}）`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
