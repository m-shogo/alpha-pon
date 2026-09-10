// Research OS — Edge 検証チェーンの実行 CLI。
//
//   pnpm research:edge-study --bundle=research/fixtures/edge-studies/<name>.json \
//     --intent="この試行で何を確かめるか"
//   pnpm research:edge-study --bundle=... --no-trial-ledger   （fixture / CI 用）
//
// 何をするか:
//   価格から事件候補を検出 → Holdout を除外 → 対照群を作る → イベントスタディ
//   → 試行回数台帳へ記録、までを1本で通す。
//
// なぜ CLI が要るか:
//   個々のモジュールは揃っていても、繋ぐ層が無ければ誰も動かせないし、
//   統合バグ（各段の入出力の食い違い）が見つからない。
//
// 重要:
//   ここで出るのは **コスト控除前の異常リターン**。tradeable な期待値ではない。
//   手数料・スリッページ・流動性・単元株を引いた判断は
//   research:backtest 側で別途行う。

import { existsSync, readFileSync } from "node:fs";
import { isCanonicalReadOnlyJsonFile } from "../../read-only-json-file.js";
import type { PriceSeries } from "../backtest.js";
import { writeGeneratedJson } from "../io.js";
import {
  computeDatasetFingerprint,
  DEFAULT_TRIALS_LEDGER_PATH,
  recordTrialOutcome,
  registerTrial,
} from "../trials-ledger.js";
import {
  detectAbnormalMoveEvents,
  type AbnormalMoveParams,
} from "../signals/abnormal-move-events.js";
import {
  runEventStudy,
  type EventStudySubject,
} from "../signals/event-study.js";
import {
  partitionByHoldout,
  type HoldoutAccessRecord,
  type HoldoutVaultManifest,
} from "../signals/holdout-partition.js";
import {
  buildMatchedControls,
  type MatchedControlParams,
} from "../signals/matched-controls.js";
import { fail, parseArgs } from "./common.js";

interface StudyBundle {
  edgeId: string;
  specId: string;
  detector: { kind: "abnormal_move"; params: SerializableAbnormalMoveParams };
  control: SerializableMatchedControlParams;
  eventStudy: { horizons: number[]; entryOffsetBars?: number };
  /**
   * treatment として扱う候補 ID。ラベリング工程の出力を想定する。
   * 省略すると検出候補すべてが treatment になり、
   * 同程度の下落が全部 treatment 扱いになるため対照が作れない。
   */
  treatmentCandidateIds?: string[];
  prices: PriceSeries[];
  benchmark: PriceSeries;
  holdout?: {
    manifest: HoldoutVaultManifest;
    requestedWindowIds?: string[];
    accessLog?: HoldoutAccessRecord[];
  };
}

/** JSON では Map / Set を表現できないので、素のオブジェクトで受けて変換する。 */
type SerializableAbnormalMoveParams =
  Omit<AbnormalMoveParams, "knownEventDates" | "corporateActionDates">
  & { knownEventDates?: Record<string, string[]>; corporateActionDates?: Record<string, string[]> };

type SerializableMatchedControlParams =
  Omit<MatchedControlParams, "knownEventDates" | "corporateActionDates" | "excludedCodes">
  & {
    knownEventDates?: Record<string, string[]>;
    corporateActionDates?: Record<string, string[]>;
    excludedCodes?: string[];
  };

function toDateMap(source: Record<string, string[]> | undefined): Map<string, Set<string>> {
  return new Map(Object.entries(source ?? {}).map(([code, dates]) => [code, new Set(dates)]));
}

function bps(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}bps`;
}

function main(): void {
  const { flags, options } = parseArgs();
  const bundlePath = options.get("bundle");
  if (!bundlePath) fail("--bundle=<file.json> を指定してください");
  if (!existsSync(bundlePath!)) fail(`ファイルがありません: ${bundlePath}`);
  if (!isCanonicalReadOnlyJsonFile(bundlePath!)) {
    fail(`study bundle must be a standalone regular file: ${bundlePath}`);
  }
  const bundle = JSON.parse(readFileSync(bundlePath!, "utf-8")) as StudyBundle;
  if (bundle.detector?.kind !== "abnormal_move") {
    fail(`未対応の detector です: ${String(bundle.detector?.kind)}`);
  }

  const securities = new Map(bundle.prices.map((series) => [series.code, series]));

  // ① 事件候補の検出
  const detected = detectAbnormalMoveEvents(bundle.prices, bundle.benchmark, {
    ...bundle.detector.params,
    knownEventDates: toDateMap(bundle.detector.params.knownEventDates),
    corporateActionDates: toDateMap(bundle.detector.params.corporateActionDates),
  });
  console.log(`① 検出      : 評価 ${detected.evaluatedCount} → 候補 ${detected.candidates.length}`);

  // ② Holdout の除外。封印期間を黙って使わない。
  let usable = detected.candidates;
  if (bundle.holdout) {
    const partition = partitionByHoldout({
      samples: detected.candidates.map((one) => ({ id: one.candidateId, code: one.code, date: one.date })),
      manifest: bundle.holdout.manifest,
      requestedWindowIds: bundle.holdout.requestedWindowIds,
      accessLog: bundle.holdout.accessLog,
      edgeId: bundle.edgeId,
    });
    const allowed = new Set([...partition.research, ...partition.opened].map((one) => one.id));
    usable = detected.candidates.filter((one) => allowed.has(one.candidateId));
    console.log(`② Holdout   : 使用 ${usable.length} / 除外 ${partition.excluded.length}`);
    for (const warning of partition.warnings) console.log(`   ⚠ ${warning}`);
  } else {
    console.log("② Holdout   : manifest 未指定のため分割していません（封印の保護なし）");
  }

  if (usable.length === 0) {
    fail("使用できる候補が0件です。イベントスタディを実行できません。");
  }

  // ③ 対照群
  //
  // 対照は「同じくらい下げたが treatment ではない (code, date)」。
  // 検出候補すべてを treatment にすると、同程度の下落は全部 treatment 側へ行き、
  // 対照が構造的に作れなくなる。ラベリングで treatment を絞るのが本来の使い方。
  const requestedTreatmentIds = bundle.treatmentCandidateIds;
  let treatmentSource = usable;
  if (requestedTreatmentIds && requestedTreatmentIds.length > 0) {
    const wanted = new Set(requestedTreatmentIds);
    const unknown = requestedTreatmentIds.filter(
      (id) => !usable.some((one) => one.candidateId === id),
    );
    if (unknown.length > 0) {
      fail(`treatmentCandidateIds に検出されていない候補が含まれています: ${unknown.join(", ")}`);
    }
    treatmentSource = usable.filter((one) => wanted.has(one.candidateId));
    console.log(
      `   treatment を ${treatmentSource.length} 件に限定しました`
      + `（残り ${usable.length - treatmentSource.length} 件は対照候補になります）`,
    );
  } else {
    console.log(
      "   ⚠ treatmentCandidateIds が未指定です。検出候補すべてが treatment になるため、"
      + "同程度の下落は対照に使えません",
    );
  }

  const treatments = treatmentSource.map((one) => ({
    id: one.candidateId,
    code: one.code,
    date: one.date,
    abnormalReturnPct: one.abnormalReturnPct,
    averageTurnoverJpy: one.averageTurnoverJpy,
  }));
  const { excludedCodes, knownEventDates, corporateActionDates, ...controlRest } = bundle.control;
  const controls = buildMatchedControls(treatments, securities, bundle.benchmark, {
    ...controlRest,
    knownEventDates: toDateMap(knownEventDates),
    corporateActionDates: toDateMap(corporateActionDates),
    ...(excludedCodes ? { excludedCodes: new Set(excludedCodes) } : {}),
  });
  console.log(
    `③ 対照群     : ${controls.matches.length} 件`
    + ` / 未マッチ ${controls.unmatchedTreatmentIds.length}`
    + ` / 部分一致 ${controls.partiallyMatched.length}`,
  );
  if (controls.unmatchedTreatmentIds.length > 0) {
    console.log("   ⚠ 対照が見つからなかった treatment があります。差分は残った分だけの比較です");
    if (!requestedTreatmentIds || requestedTreatmentIds.length === 0) {
      console.log(
        "     全候補を treatment にしているため、同程度の下落が対照側に残っていません。"
        + "ラベリングで treatment を絞ってください",
      );
    }
  }

  // ④ イベントスタディ
  const subjects: EventStudySubject[] = [
    ...treatments.map((one) => ({
      id: one.id, code: one.code, eventDate: one.date,
      group: "treatment" as const, pairId: one.id,
    })),
    ...controls.matches.map((match, index) => ({
      id: `ctl-${index}-${match.controlCode}-${match.controlDate}`,
      code: match.controlCode,
      eventDate: match.controlDate,
      group: "control" as const,
      pairId: match.treatmentId,
    })),
  ];
  const study = runEventStudy(subjects, securities, bundle.benchmark, bundle.eventStudy);
  console.log(`④ イベントスタディ: 対象 ${study.subjectCount} → 観測 ${study.observations.length}`);
  console.log("");
  console.log("horizon | treatment n / 平均 / clusters / t(補正) | control n / 平均 | 差分 | 回復率 T/C");
  for (const row of study.summaryByHorizon) {
    const t = row.treatment;
    const c = row.control;
    console.log(
      `D+${String(row.horizonBars).padEnd(4)}`
      + `| ${String(t.count).padStart(4)} / ${bps(t.meanNetAlphaBps).padStart(10)} / ${String(t.clusterCount ?? 0).padStart(3)} / `
      + `${t.clusteredTStat === null ? "  n/a" : t.clusteredTStat.toFixed(2).padStart(5)} `
      + `| ${String(c.count).padStart(4)} / ${bps(c.meanNetAlphaBps).padStart(10)} `
      + `| ${row.differenceBps === null ? "     n/a" : bps(row.differenceBps).padStart(8)} `
      + `| ${row.treatmentReclaimRate === null ? "n/a" : `${(row.treatmentReclaimRate * 100).toFixed(0)}%`}`
      + ` / ${row.controlReclaimRate === null ? "n/a" : `${(row.controlReclaimRate * 100).toFixed(0)}%`}`,
    );
  }
  console.log("");
  console.log("※ コスト控除前の異常リターンです。tradeable な期待値ではありません。");
  console.log("   手数料・スリッページ・流動性・単元株を引いた判断は research:backtest 側で行います。");

  // ⑤ 試行回数台帳
  const useLedger = !flags.has("no-trial-ledger");
  if (useLedger) {
    const intent = options.get("intent")?.trim();
    if (!intent) {
      fail('--intent="この試行で何を確かめるか" を指定してください（--no-trial-ledger で省略可）');
    }
    const ledgerPath = options.get("trials-ledger") ?? DEFAULT_TRIALS_LEDGER_PATH;
    const registered = registerTrial(
      {
        edgeId: bundle.edgeId,
        specId: bundle.specId,
        params: {
          detector: bundle.detector,
          control: bundle.control,
          eventStudy: bundle.eventStudy,
          treatmentCandidateIds: [...(bundle.treatmentCandidateIds ?? [])].sort(),
          holdoutWindows: bundle.holdout?.requestedWindowIds ?? [],
        },
        datasetFingerprint: computeDatasetFingerprint({
          signalIds: subjects.map((one) => one.id),
          priceCodes: bundle.prices.map((one) => one.code),
          benchmarkCode: bundle.benchmark.code,
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
        meanNetAlphaBps: longest?.treatment.meanNetAlphaBps ?? 0,
        tStat: longest?.treatment.tStat ?? null,
        clusteredTStat: longest?.treatment.clusteredTStat ?? null,
        clusterCount: longest?.treatment.clusterCount ?? null,
      },
      ledgerPath,
    );
    console.log("");
    console.log(
      `⑤ 試行回数   : ${registered.trialCount} — ${ledgerPath}`
      + `（${registered.isNew ? "新規試行" : "既存試行の再実行"}）`,
    );
  }

  const out = options.get("out");
  if (out) {
    writeGeneratedJson(out, {
      edgeId: bundle.edgeId,
      specId: bundle.specId,
      detected: { evaluatedCount: detected.evaluatedCount, candidateCount: detected.candidates.length, rejectedCounts: detected.rejectedCounts },
      controls: { matched: controls.matches.length, unmatched: controls.unmatchedTreatmentIds, partiallyMatched: controls.partiallyMatched },
      summaryByHorizon: study.summaryByHorizon,
      skippedCounts: study.skippedCounts,
    });
    console.log(`✓ ${out} に保存しました`);
  }
}

main();
