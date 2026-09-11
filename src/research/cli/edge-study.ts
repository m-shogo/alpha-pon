// Research OS — Edge 検証チェーンの実行 CLI。
//
//   pnpm research:edge-study --bundle=research/fixtures/edge-studies/<name>.json \
//     --intent="この試行で何を確かめるか"
//   pnpm research:edge-study --bundle=... --labels=research/event_labels.jsonl
//   pnpm research:edge-study --bundle=... --no-trial-ledger   （fixture / CI 用）
//
//   実データで走らせる（価格は bundle に埋めず、取り込み済みストアから読む）:
//   pnpm research:edge-study --bundle=... --from-store --from=2024-12-01 --to=2025-06-30 \
//     --min-turnover-jpy=500000000 --intent="..."
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
import { resolve } from "node:path";
import { isCanonicalReadOnlyJsonFile } from "../../read-only-json-file.js";
import type { PriceSeries } from "../backtest.js";
import { paths, writeGeneratedJson } from "../io.js";
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
  mergeHoldoutManifests,
} from "../signals/holdout-partition.js";
import {
  readEventLabels,
  resolveEventLabels,
  splitCandidatesByLabel,
} from "../signals/event-labels.js";
import {
  buildMatchedControls,
  type MatchedControlParams,
} from "../signals/matched-controls.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadEarningsEventDatesFromStore,
  loadStudyInputsFromStore,
} from "../study-inputs-from-store.js";
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
  /** `--from-store` を使うときは省略する（4,400銘柄×500日を JSON に埋められない）。 */
  prices?: PriceSeries[];
  benchmark?: PriceSeries;
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

function numberOption(options: Map<string, string>, name: string, fallback: number): number {
  const raw = options.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`--${name} は数値で指定してください: ${raw}`);
  return value;
}

/**
 * 正本の金庫を読む。無ければ null（封印されていない環境もある）。
 *
 * **壊れていたら止める。** 読めないのを「封印なし」として扱うと、
 * 金庫が壊れた瞬間に封印が消える。
 */
function readVaultManifest(): HoldoutVaultManifest | null {
  const path = paths.holdoutManifest();
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as HoldoutVaultManifest;
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

  let fromStore: ReturnType<typeof loadStudyInputsFromStore> | null = null;
  if (flags.has("from-store")) {
    try {
      fromStore = loadStudyInputsFromStore({
        ...(options.get("from") ? { from: options.get("from")! } : {}),
        ...(options.get("to") ? { to: options.get("to")! } : {}),
        minTurnoverJpy: numberOption(options, "min-turnover-jpy", 0),
      });
    } catch (error) {
      if (error instanceof StudyInputsError) fail(error.message);
      throw error;
    }
    for (const line of formatStudyInputs(fromStore!, numberOption(options, "min-turnover-jpy", 0))) {
      console.log(`⓪ ${line}`);
    }
  }
  const prices = fromStore ? fromStore.prices : bundle.prices;
  const benchmark = fromStore ? fromStore.benchmark : bundle.benchmark;
  if (!prices || prices.length === 0) {
    fail("価格がありません。bundle に prices を入れるか --from-store を指定してください");
  }
  if (!benchmark) {
    fail("benchmark がありません。bundle に benchmark を入れるか --from-store を指定してください");
  }
  const securities = new Map(prices!.map((series) => [series.code, series]));

  // 決算開示から「説明のつく日」を組む。
  //
  // 権利落ちと同じ理由で、ストアから走らせるときは bundle ではなく保存庫を見る。
  // bundle 側に書き写すと、取り込みで開示が伸びても古いまま使われる。
  // 空の Map は「既知イベントが無い」ではなく「情報が無い」を意味するので、
  // 黙って空で走らせない（`--no-earnings-calendar` で明示的に外せる）。
  let storeEarningsDates: Map<string, Set<string>> | null = null;
  if (fromStore && !flags.has("no-earnings-calendar")) {
    try {
      const earnings = loadEarningsEventDatesFromStore({
        tradingDates: fromStore.tradingDates,
        ...(options.get("to") ? { to: options.get("to")! } : {}),
      });
      storeEarningsDates = earnings.byCode;
      console.log(
        `⓪ 決算カレンダー ${earnings.datesScanned}営業日 / 開示 ${earnings.disclosureCount.toLocaleString()}件`
        + ` → ${earnings.byCode.size}銘柄 / 除外対象 ${earnings.markedDates.toLocaleString()}日`,
      );
    } catch (error) {
      if (error instanceof StudyInputsError) fail(error.message);
      throw error;
    }
  }

  // ① 事件候補の検出
  //
  // ストアから走らせるときは、権利落ちを bundle ではなく台帳から入れる。
  // bundle 側に書き写すと、取り込みで台帳が伸びても古いまま使われる。
  const detected = detectAbnormalMoveEvents(prices!, benchmark!, {
    ...bundle.detector.params,
    knownEventDates: storeEarningsDates ?? toDateMap(bundle.detector.params.knownEventDates),
    corporateActionDates: fromStore
      ? fromStore.corporateActionDates
      : toDateMap(bundle.detector.params.corporateActionDates),
  });
  console.log(`① 検出      : 評価 ${detected.evaluatedCount} → 候補 ${detected.candidates.length}`);
  // 却下の内訳を必ず出す。特に market_model_unavailable が多いときは
  // 「候補が少ない＝異常が無かった」ではなく「測れなかった」なので、
  // 件数だけ見て結論を出すと必ず誤読する（実際に一度誤読した）。
  const rejectSummary = Object.entries(detected.rejectedCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");
  if (rejectSummary) console.log(`   却下       : ${rejectSummary}`);
  const unavailable = detected.rejectedCounts.market_model_unavailable;
  if (unavailable > detected.evaluatedCount * 0.5) {
    console.log(
      `   ⚠ 評価の ${(unavailable / detected.evaluatedCount * 100).toFixed(0)}% で市場モデルを推定できていません。`
      + "履歴が推定窓に足りていない期間が含まれます。候補の少なさを結論にしないでください",
    );
  }

  // ② Holdout の除外。封印期間を黙って使わない。
  let usable = detected.candidates;
  // bundle が holdout 節を持っていなくても、正本の金庫があるなら必ず効かせる。
  // 以前は「manifest 未指定のため分割していません（封印の保護なし）」と
  // 出して素通りしていた。**書き忘れた bundle だけが封印を覗ける**のは
  // 封印とは言えない。
  const vaultOnly = !bundle.holdout ? readVaultManifest() : null;
  if (bundle.holdout || vaultOnly) {
    // bundle の宣言だけを信じない。正本の金庫と突き合わせて**和集合**を使う。
    // 2026-09-11 に、bundle へ自前の manifest を書くことで封印が8ヶ月ぶん
    // 狭まった状態で探索してしまった。金庫の鍵を金庫の中に置いていた。
    const merged = bundle.holdout
      ? mergeHoldoutManifests({ bundle: bundle.holdout.manifest, vault: readVaultManifest() })
      : { manifest: vaultOnly!, narrowed: [] };
    if (!bundle.holdout) {
      console.log("   bundle に holdout 節が無いので正本の金庫をそのまま使う");
    }
    if (merged.narrowed.length > 0) {
      console.log("   ⚠ bundle の封印が正本より狭い。正本の窓を足して実行する:");
      for (const window of merged.narrowed) {
        console.log(`     ${window.id}  ${window.from} 〜 ${window.to}（${window.scope}）`);
      }
    }
    const partition = partitionByHoldout({
      samples: detected.candidates.map((one) => ({ id: one.candidateId, code: one.code, date: one.date })),
      manifest: merged.manifest,
      ...(bundle.holdout?.requestedWindowIds
        ? { requestedWindowIds: bundle.holdout.requestedWindowIds } : {}),
      ...(bundle.holdout?.accessLog ? { accessLog: bundle.holdout.accessLog } : {}),
      edgeId: bundle.edgeId,
    });
    const allowed = new Set([...partition.research, ...partition.opened].map((one) => one.id));
    usable = detected.candidates.filter((one) => allowed.has(one.candidateId));
    console.log(`② Holdout   : 使用 ${usable.length} / 除外 ${partition.excluded.length}`);
    for (const warning of partition.warnings) console.log(`   ⚠ ${warning}`);
  } else {
    console.log("② Holdout   : bundle にも正本にも封印が無い（保護なし）");
  }

  if (usable.length === 0) {
    fail("使用できる候補が0件です。イベントスタディを実行できません。");
  }

  // ③ 対照群
  //
  // 対照は「同じくらい下げたが treatment ではない (code, date)」。
  // 検出候補すべてを treatment にすると、同程度の下落は全部 treatment 側へ行き、
  // 対照が構造的に作れなくなる。ラベリングで treatment を絞るのが本来の使い方。
  // ラベル台帳があればそちらを優先する。原因を特定したものだけが treatment。
  const labelsPath = options.get("labels");
  let requestedTreatmentIds = bundle.treatmentCandidateIds;
  // 原因が特定できていない下落は対照にも使わない。
  // 実は研究対象の事件だった場合、対照へ混ぜると差が過小評価される。
  const excludedSampleKeys = new Set<string>();
  if (labelsPath) {
    if (!existsSync(labelsPath)) fail(`ラベル台帳がありません: ${labelsPath}`);
    const split = splitCandidatesByLabel(
      usable.map((one) => one.candidateId),
      resolveEventLabels(readEventLabels(labelsPath)),
    );
    requestedTreatmentIds = split.treatmentCandidateIds;
    console.log(
      `   ラベル台帳: treatment ${split.treatmentCandidateIds.length}`
      + ` / 対照候補 ${split.controlPoolCandidateIds.length}`
      + ` / 未ラベル ${split.unlabelledCandidateIds.length}`,
    );
    const byId = new Map(usable.map((one) => [one.candidateId, one]));
    for (const candidateId of split.unlabelledCandidateIds) {
      const candidate = byId.get(candidateId);
      if (candidate) excludedSampleKeys.add(`${candidate.code}|${candidate.date}`);
    }
    if (split.unlabelledCandidateIds.length > 0) {
      console.log(
        "   ⚠ 未ラベルの候補は treatment にも対照にも使いません。"
        + "原因を特定していないものを母集団に混ぜないためです",
      );
    }
    if (split.treatmentCandidateIds.length === 0) {
      fail("ラベル台帳に treatment に該当する候補がありません。ラベリングを進めてください。");
    }
  }
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
    const controlPoolCount = usable.length - treatmentSource.length - excludedSampleKeys.size;
    console.log(
      `   treatment を ${treatmentSource.length} 件に限定しました`
      + `（対照候補 ${controlPoolCount} 件 / 除外 ${excludedSampleKeys.size} 件）`,
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
  const controls = buildMatchedControls(treatments, securities, benchmark!, {
    ...controlRest,
    knownEventDates: storeEarningsDates ?? toDateMap(knownEventDates),
    corporateActionDates: fromStore
      ? fromStore.corporateActionDates
      : toDateMap(corporateActionDates),
    ...(excludedCodes ? { excludedCodes: new Set(excludedCodes) } : {}),
    ...(excludedSampleKeys.size > 0 ? { excludedSampleKeys } : {}),
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
  const study = runEventStudy(subjects, securities, benchmark!, bundle.eventStudy);
  console.log(`④ イベントスタディ: 対象 ${study.subjectCount} → 観測 ${study.observations.length}`);
  console.log("");
  // 表示する平均は**イベント日を等加重**にしたもの。t(補正) が検定しているのが
  // それであり、1件ずつの等加重を並べると「平均は正なのに t は負」という
  // 自己矛盾した表になる（backtest 側で実際に起きた）。
  console.log("horizon | treatment n / クラスタ平均 / clusters / t(補正) | control n / クラスタ平均 | 差分 | 回復率 T/C");
  for (const row of study.summaryByHorizon) {
    const t = row.treatment;
    const c = row.control;
    const clustered = (stats: typeof t): string =>
      stats.clusteredMeanNetAlphaBps === null ? "       n/a" : bps(stats.clusteredMeanNetAlphaBps).padStart(10);
    console.log(
      `D+${String(row.horizonBars).padEnd(4)}`
      + `| ${String(t.count).padStart(4)} / ${clustered(t)} / ${String(t.clusterCount ?? 0).padStart(3)} / `
      + `${t.clusteredTStat === null ? "  n/a" : t.clusteredTStat.toFixed(2).padStart(5)} `
      + `| ${String(c.count).padStart(4)} / ${clustered(c)} `
      + `| ${row.clusteredDifferenceBps === null ? "     n/a" : bps(row.clusteredDifferenceBps).padStart(8)} `
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
          // 走らせた実際の母集団で指紋を取る。bundle 側を見ると
          // --from-store のとき「価格が無い」ことになって指紋が縮退する。
          priceCodes: prices!.map((one) => one.code),
          benchmarkCode: benchmark!.code,
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
      new Date(),
      // 測定のコードを直して測り直したときだけ、理由つきで置き換える。
      // 省略すると「同じ試行で違う結果」は落ちる（非決定性の検出）。
      { ...(options.get("supersede") ? { supersedesReason: options.get("supersede")! } : {}) },
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
