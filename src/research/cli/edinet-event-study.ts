/**
 * EDINET の臨時報告書を母集団にしたイベントスタディ。
 *
 * 引数は **`--key=値`** の形だけ。空白で区切ると値が読まれない（parseArgs の仕様）。
 *
 *   pnpm research:edinet-study -- --reasons=第19条第2項第3号 \
 *     --from=2024-06-19 --to=2026-02-28 --intent="..."
 *
 * 臨時報告書以外（訂正報告書など）を母集団にするときは書類種別の説明で指定する。
 *
 *   pnpm research:edinet-study -- --doc-descriptions=訂正有価証券報告書 \
 *     --dedupe-days=60 --from=2024-06-19 --intent="..."
 *
 * `--reasons` と `--doc-descriptions` はどちらか一方だけ。
 *
 * `--exclude-known-earnings` を付けると、反応日が決算開示日（と翌営業日）に当たる
 * イベントを落とす。決算と同じ日に出る事由（連結業績への影響など）を測るときは
 * **付けないと決算反応を測ってしまう**。事前登録でどちらにするかを決めておくこと。
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
import { averageTurnoverJpy } from "../signals/abnormal-return.js";
import { edinetEvidence, type LabelEvidence } from "../signals/label-evidence.js";
import {
  buildEdinetReasonEvents,
  type EdinetReasonEvent,
} from "../signals/edinet-reason-events.js";
import { formatHorizonSkips, runEventStudy, type EventStudySubject } from "../signals/event-study.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadEarningsEventDatesFromStore,
  loadStudyInputsFromStore,
  resolveResearchTo,
} from "../study-inputs-from-store.js";
import {
  computeDatasetFingerprint,
  DEFAULT_TRIALS_LEDGER_PATH,
  recordTrialOutcome,
  registerTrial,
} from "../trials-ledger.js";
import { fail, parseArgs } from "./common.js";

const DEFAULT_HORIZONS = [1, 5, 20, 60];
/** 流動性の判定に使う本数（検出器・指数と同じ）。 */
const TURNOVER_LOOKBACK_BARS = 20;

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
  const docsRaw = options.get("doc-descriptions");
  if ((reasonsRaw === undefined) === (docsRaw === undefined)) {
    fail("--reasons=<事由コード[,…]> か --doc-descriptions=<書類種別の説明[,…]> のどちらか一方を指定してください");
  }
  const reasonCodes = (reasonsRaw ?? "").split(",").map((one) => one.trim()).filter(Boolean);
  const docDescriptions = (docsRaw ?? "").split(",").map((one) => one.trim()).filter(Boolean);
  if (reasonsRaw !== undefined && reasonCodes.length === 0) fail("--reasons が空です");
  if (docsRaw !== undefined && docDescriptions.length === 0) fail("--doc-descriptions が空です");
  const byDocument = docDescriptions.length > 0;
  // 訂正報告書は同じ会社が数日つづけて出す。まとめる幅は事前登録で決めて渡す。
  const dedupeCalendarDays = Number(options.get("dedupe-days") ?? 0);
  if (!Number.isSafeInteger(dedupeCalendarDays) || dedupeCalendarDays < 0) {
    fail("--dedupe-days は0以上の整数で指定してください");
  }

  const from = options.get("from");
  // 封印は CLI ごとに書かない。書き忘れた CLI だけが覗くことになる。
  const research = resolveResearchTo(options.get("to") ?? null);
  if (research.violation) fail(research.violation);
  const to = research.to ?? undefined;
  if (to) {
    console.log(
      options.get("to")
        ? `期間  : 〜 ${to}（明示指定）`
        : `期間  : 〜 ${to}（封印 ${research.sealed!.windowId} の前日まで）`,
    );
  }
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

  const built = buildEdinetReasonEvents({
    evidence,
    ...(byDocument ? { documentDescriptionPrefixes: docDescriptions } : { reasonCodes }),
    tradingDates,
    dedupeCalendarDays,
  });
  console.log(
    byDocument
      ? `① 書類種別     : ${docDescriptions.join(" / ")}（先頭一致`
        + `${dedupeCalendarDays > 0 ? ` / 同一銘柄 ${dedupeCalendarDays}日以内はまとめる` : ""}）`
      : `① 事由         : ${reasonCodes.join(" / ")}`,
  );
  console.log(
    `   EDINET 書類  ${built.evaluatedCount}件 → イベント ${built.events.length}件`
    + ` / ${new Set(built.events.map((one) => one.code)).size}社`,
  );
  const rejects = Object.entries(built.rejectedCounts)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");
  if (rejects) console.log(`   除外         ${rejects}`);

  // 板が薄い銘柄の終値はその日の市場変動を反映しないので測らない。
  // 流動性は**イベントの時点**で判定する（反応日を含む直近20本の平均売買代金。
  // エントリーは翌営業日の寄付なので、反応日の出来高は判断の時点で分かっている）。
  // 以前は期間の最後の20営業日で絞っており、先読みだった。
  const securities = new Map(inputs.prices.map((series) => [series.code, series]));
  // 決算の反応を「事由の反応」と呼ばないための除外。既定は落とさない（従来の挙動）。
  const excludeKnownEarnings = flags.has("exclude-known-earnings");
  const knownEarnings = excludeKnownEarnings
    ? loadEarningsEventDatesFromStore({
        tradingDates: inputs.tradingDates,
        ...(to ? { to } : {}),
      }).byCode
    : new Map<string, Set<string>>();
  let illiquidAtEvent = 0;
  let noBarAtEvent = 0;
  let onKnownEarnings = 0;
  const usable: EdinetReasonEvent[] = built.events.filter((one) => {
    const series = securities.get(one.code);
    if (!series) {
      illiquidAtEvent += 1;
      return false;
    }
    const index = series.bars.findIndex((bar) => bar.date === one.reactionDate);
    if (index < 0) {
      noBarAtEvent += 1;
      return false;
    }
    if (averageTurnoverJpy(series, index, TURNOVER_LOOKBACK_BARS) < minTurnoverJpy) {
      illiquidAtEvent += 1;
      return false;
    }
    if (knownEarnings.get(one.code)?.has(one.reactionDate)) {
      onKnownEarnings += 1;
      return false;
    }
    return true;
  });
  console.log(
    `   流動性で残る ${usable.length}件`
    + `（反応日の時点で売買代金${(minTurnoverJpy / 1e8).toFixed(0)}億円/日以上。`
    + `落ちた ${illiquidAtEvent}件 / 反応日に足が無い ${noBarAtEvent}件`
    + `${excludeKnownEarnings ? ` / 決算日 ${onKnownEarnings}件` : " / 決算日は除外していない"}）`,
  );
  if (usable.length === 0) fail("測れるイベントが0件です");

  const subjects: EventStudySubject[] = usable.map((one) => ({
    id: one.eventId,
    code: one.code,
    eventDate: one.reactionDate,
    group: "treatment",
    pairId: one.eventId,
  }));
  // 価格は無調整。保有区間の分割・併合は段差になるので台帳で落とす。
  const study = runEventStudy(subjects, securities, inputs.benchmark, {
    horizons: DEFAULT_HORIZONS,
    corporateActionDates: inputs.corporateActionDates,
  });

  console.log(`② イベントスタディ: 対象 ${study.subjectCount} → 観測 ${study.observations.length}`);
  if (study.skipped.length > 0) {
    const counts = new Map<string, number>();
    for (const one of study.skipped) counts.set(one.reason, (counts.get(one.reason) ?? 0) + 1);
    console.log(`   測れず       ${[...counts].map(([r, c]) => `${r}=${c}`).join(" ")}`);
  }
  for (const line of formatHorizonSkips(study)) console.log(line);
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
  const edgeId = byDocument
    ? `edinet-doc:${docDescriptions.join("+")}`
    : `edinet-reason:${reasonCodes.join("+")}`;
  const registered = registerTrial(
    {
      edgeId,
      specId: byDocument ? "edinet-document-event-study-v1" : "edinet-reason-event-study-v1",
      params: {
        ...(byDocument
          ? { docDescriptions: [...docDescriptions].sort(), dedupeCalendarDays }
          : { reasonCodes: [...reasonCodes].sort() }),
        ...(excludeKnownEarnings ? { excludeKnownEarnings: true } : {}),
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
  // 台帳に残すのは**事前登録の主要 horizon**。既定は最長（従来の挙動）。
  // 主要を指定しないまま最長を記録すると、事前登録と台帳が食い違う（2026-09-21 に実際に起きた）。
  const primaryHorizonRaw = options.get("primary-horizon");
  const primaryHorizon = primaryHorizonRaw === undefined
    ? study.summaryByHorizon.at(-1)?.horizonBars
    : Number(primaryHorizonRaw);
  const recorded = study.summaryByHorizon.find((row) => row.horizonBars === primaryHorizon);
  if (primaryHorizonRaw !== undefined && !recorded) {
    fail(`--primary-horizon=${primaryHorizonRaw} は測った horizon（${study.summaryByHorizon.map((row) => row.horizonBars).join(", ")}）にありません`);
  }
  const longest = recorded;
  recordTrialOutcome(
    registered.trialId,
    {
      executedCount: longest?.treatment.count ?? 0,
      meanNetAlphaBps: longest?.treatment.clusteredMeanNetAlphaBps ?? 0,
      clusterCount: longest?.treatment.clusterCount ?? null,
      tStat: longest?.treatment.tStat ?? null,
      clusteredTStat: longest?.treatment.clusteredTStat ?? null,
      ...(longest === undefined ? {} : { horizon: longest.horizonBars }),
    },
    ledgerPath,
      new Date(),
      // 測定のコードを直して測り直したときだけ、理由つきで置き換える。
      // 省略すると「同じ試行で違う結果」は落ちる（非決定性の検出）。
      { ...(options.get("supersede") ? { supersedesReason: options.get("supersede")! } : {}) },
  );
  console.log(
    `試行として記録: ${registered.trialId}（${edgeId}`
    + `${longest === undefined ? "" : ` / D+${longest.horizonBars} の結果`}）`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
