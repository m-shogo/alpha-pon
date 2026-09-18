// Research OS — 封印（holdout）を開けて、事前登録した確認を1回だけ行う。
//
//   pnpm research:holdout:open --bundle=research/studies/<name>.json \
//     --prereg=docs/research/preregistrations/<name>.md \
//     --from=2026-03-01 --trading-days=189 --min-t=1.96 --min-clusters=20 --actor=<名前>
//     → 計画だけ表示する（価格は読まない）
//   同じ引数に --execute を付ける
//     → 1回だけ実行し、結果を research/holdout/access_log.jsonl に追記する（消せない）
//
// bundle は2種類:
//   - backtest bundle（spec + detector）: 補正後 t ≥ --min-t かつ Net > 0 で合格
//   - kind = "disclosure_event_study": 主要 horizon の |t| ≥ --min-t（両側）で「反応あり」
//
// 止める条件（どれか1つでも当たれば開けない）:
//   - 事前登録がコミットされていない、変更中、または条件（bundle・開始日・営業日数）を書いていない
//   - この Edge がすでに開封されている（1 Edge 1回）
//   - 確認期間の営業日が足りない（価格は見ずに、取り込み済みの営業日で数える）
//   - 確認期間に取り込みの穴がある
//   - 確認期間が封印の窓と重ならない（ただの研究になる）

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCanonicalReadOnlyJsonFile } from "../../read-only-json-file.js";
import { buildUniquePriceSeriesMap } from "../backtest-bundle-input.js";
import {
  applyLendableFilter,
  buildFromStore,
  StoreRunError,
  type BacktestStoreBundle,
} from "../backtest-store-run.js";
import { runBacktest } from "../backtest.js";
import {
  assertDisclosureEventStudyBundle,
  EventStudyRunError,
  runDisclosureEventStudy,
  type DisclosureEventStudyBundle,
} from "../event-study-store-run.js";
import {
  assertNotOpenedBefore,
  assertPreregistrationMatches,
  buildAccessEntry,
  HoldoutOpenError,
  judgeConfirmation,
  judgeEventStudy,
  missingWeekdays,
  overlappingWindows,
  resolveConfirmationRange,
} from "../holdout-open.js";
import { appendJsonl, loadSchema, paths, readJsonl, writeGeneratedJson } from "../io.js";
import { jstDateOf } from "../pit.js";
import { completedDatesFrom, INGEST_LEDGER_NAME } from "../providers/jquants-daily-ingest.js";
import { listIngestedDates, resolveStoreRoot } from "../providers/jquants-daily-store.js";
import { formatErrors, validate } from "../schema.js";
import type { HoldoutVaultManifest } from "../signals/holdout-partition.js";
import { fail, nowJstIso, parseArgs } from "./common.js";

function requiredOption(options: Map<string, string>, name: string): string {
  const value = options.get(name)?.trim();
  if (!value) fail(`--${name}=... を指定してください`);
  return value!;
}

function gitCommitOf(path: string): { hash: string; committedAt: string } {
  let status: string;
  let log: string;
  try {
    status = execFileSync("git", ["status", "--porcelain", "--", path], { encoding: "utf-8" });
    log = execFileSync("git", ["log", "-1", "--format=%H %cI", "--", path], { encoding: "utf-8" }).trim();
  } catch (error) {
    fail(`git で事前登録の状態を確かめられません: ${(error as Error).message}`);
  }
  if (status!.trim() !== "") fail(`事前登録に未コミットの変更があります: ${path}`);
  if (log! === "") fail(`事前登録がコミットされていません: ${path}`);
  const [hash, committedAt] = log!.split(" ");
  return { hash: hash!, committedAt: committedAt! };
}

interface OpenOutcome {
  result: "pass" | "fail";
  netAlphaBps?: number;
  sampleCount: number;
  notes: Record<string, unknown>;
  lines: string[];
  report: unknown;
}

function runBacktestOpen(
  bundle: BacktestStoreBundle,
  from: string,
  to: string,
  minT: number,
  minClusters: number,
): OpenOutcome {
  let signals;
  let built;
  try {
    built = buildFromStore(bundle, {
      to,
      minTurnoverJpy: bundle.spec.liquidity.minAdtvJpy!,
      useEarningsCalendar: true,
      // 封印を開ける経路。ここだけが明示的に封印期間を読める。
      allowSealed: true,
    });
    signals = built.signals.filter((signal) => {
      const date = jstDateOf(signal.observedAt);
      return date >= from && date <= to;
    });
    console.log(`確認期間のシグナル: ${signals.length}（全期間 ${built.signals.length} のうち）`);
    if (bundle.filters?.lendableOnly) signals = applyLendableFilter(signals, to);
  } catch (error) {
    if (error instanceof StoreRunError) fail(error.message);
    throw error;
  }
  const report = runBacktest(
    bundle.spec,
    signals!,
    buildUniquePriceSeriesMap(built!.prices),
    built!.benchmark,
    { corporateActionDates: built!.corporateActionDates },
  );
  const judged = judgeConfirmation({
    clusteredTStat: report.net.clusteredTStat,
    meanNetAlphaBps: report.net.meanNetAlphaBps,
    executedCount: report.executedCount,
    clusterCount: report.net.clusterCount,
    minT,
    minClusters,
  });
  return {
    result: judged.result,
    netAlphaBps: report.net.meanNetAlphaBps,
    sampleCount: report.executedCount,
    notes: {
      kind: "backtest",
      clusteredTStat: report.net.clusteredTStat,
      clusterCount: report.net.clusterCount,
      clusteredMeanNetAlphaBps: report.net.clusteredMeanNetAlphaBps,
      signalCount: report.signalCount,
      reason: judged.reason,
    },
    lines: [
      `シグナル ${report.signalCount} 件 / 約定 ${report.executedCount} 件`,
      `Net 平均 ${report.net.meanNetAlphaBps.toFixed(1)}bps / 中央値 ${report.net.medianNetAlphaBps.toFixed(1)}bps`,
      `クラスタ平均 ${report.net.clusteredMeanNetAlphaBps?.toFixed(1) ?? "n/a"}bps（${report.net.clusterCount ?? 0}日）`
        + ` / t = ${report.net.clusteredTStat?.toFixed(4) ?? "n/a"}`,
      `判定    : ${judged.result.toUpperCase()} — ${judged.reason}`,
    ],
    report,
  };
}

function runEventStudyOpen(
  bundle: DisclosureEventStudyBundle,
  to: string,
  minT: number,
  minClusters: number,
): OpenOutcome {
  let run;
  try {
    run = runDisclosureEventStudy(bundle, { to });
  } catch (error) {
    if (error instanceof EventStudyRunError) fail(error.message);
    throw error;
  }
  const primary = run!.primary.treatment;
  const judged = judgeEventStudy({
    clusteredTStat: primary.clusteredTStat,
    count: primary.count,
    clusterCount: primary.clusterCount,
    minAbsT: minT,
    minClusters,
  });
  const horizons = run!.study.summaryByHorizon.map((row) => ({
    horizon: row.horizonBars,
    count: row.treatment.count,
    clusterCount: row.treatment.clusterCount,
    clusteredMeanBps: row.treatment.clusteredMeanNetAlphaBps,
    clusteredTStat: row.treatment.clusteredTStat,
  }));
  return {
    result: judged.result,
    sampleCount: primary.count,
    notes: {
      kind: "disclosure_event_study",
      costs: "not_deducted",
      primaryHorizon: bundle.primaryHorizon,
      direction: judged.direction,
      reason: judged.reason,
      horizons,
      placebo: run!.placebo,
      eventCount: run!.events.length,
      populationRejected: run!.populationRejected,
      measurementRejected: run!.measurementRejected,
    },
    lines: [
      "horizon | n / クラスタ平均（コスト前） / clusters / t(補正)",
      ...horizons.map((row) =>
        `D+${String(row.horizon).padEnd(3)} | ${String(row.count).padStart(4)} / `
        + `${row.clusteredMeanBps === null ? "n/a" : `${row.clusteredMeanBps.toFixed(1)}bps`} / `
        + `${row.clusterCount ?? 0} / ${row.clusteredTStat === null ? "n/a" : row.clusteredTStat.toFixed(4)}`),
      `判定    : ${judged.result.toUpperCase()}（向き ${judged.direction}）— ${judged.reason}`,
      "※ 売買の合否ではない。向きが出ても、売買は別に事前登録して後の期間で確かめる",
    ],
    report: { study: run!.study, placebo: run!.placebo, events: run!.events },
  };
}

function main(): void {
  const { flags, options } = parseArgs();
  const bundlePath = requiredOption(options, "bundle");
  const preregPath = requiredOption(options, "prereg");
  const from = requiredOption(options, "from");
  const tradingDays = Number(requiredOption(options, "trading-days"));
  const minT = Number(requiredOption(options, "min-t"));
  const minClusters = Number(requiredOption(options, "min-clusters"));
  const actor = requiredOption(options, "actor");
  const execute = flags.has("execute");

  if (!existsSync(bundlePath) || !isCanonicalReadOnlyJsonFile(bundlePath)) {
    fail(`bundle が読めません: ${bundlePath}`);
  }
  const rawBundle = JSON.parse(readFileSync(bundlePath, "utf-8")) as unknown;
  const isEventStudy = typeof rawBundle === "object" && rawBundle !== null
    && (rawBundle as { kind?: unknown }).kind === "disclosure_event_study";
  let edgeId: string;
  let specId: string;
  let label: string;
  let backtestBundle: BacktestStoreBundle | null = null;
  let eventStudyBundle: DisclosureEventStudyBundle | null = null;
  if (isEventStudy) {
    try {
      assertDisclosureEventStudyBundle(rawBundle);
    } catch (error) {
      if (error instanceof EventStudyRunError) fail(`bundle が不正です: ${error.message}`);
      throw error;
    }
    eventStudyBundle = rawBundle as DisclosureEventStudyBundle;
    edgeId = eventStudyBundle.edgeId;
    specId = eventStudyBundle.specId;
    label = `イベントスタディ・両側・主要 D+${eventStudyBundle.primaryHorizon}`;
  } else {
    backtestBundle = rawBundle as BacktestStoreBundle;
    const specErrors = validate(backtestBundle.spec, loadSchema("backtest"));
    if (specErrors.length > 0) fail(`spec がスキーマに適合しません:\n${formatErrors(specErrors)}`);
    if (backtestBundle.spec.liquidity.minAdtvJpy === undefined) {
      fail("spec.liquidity.minAdtvJpy がありません（流動性の下限は bundle で決める）");
    }
    edgeId = backtestBundle.spec.edgeId;
    specId = backtestBundle.spec.id;
    label = `backtest・${backtestBundle.spec.side}`;
  }

  if (!existsSync(preregPath)) fail(`事前登録がありません: ${preregPath}`);
  const prereg = gitCommitOf(preregPath);
  const accessLogPath = paths.holdoutAccessLog();
  const accessLog = readJsonl(accessLogPath) as { edgeId: string; purpose: string; openedAt: string; id: string }[];
  const manifest = JSON.parse(readFileSync(paths.holdoutManifest(), "utf-8")) as HoldoutVaultManifest;

  const storeRoot = resolveStoreRoot();
  let to: string;
  let windows: string[];
  try {
    assertPreregistrationMatches(readFileSync(preregPath, "utf-8"), { bundlePath, from, tradingDays, minT, minClusters });
    assertNotOpenedBefore(accessLog, edgeId);
    const range = resolveConfirmationRange({ tradingDates: listIngestedDates(storeRoot), from, tradingDays });
    console.log(`Edge    : ${edgeId}（spec ${specId} / ${label}）`);
    console.log(`事前登録: ${preregPath}（${prereg.hash.slice(0, 8)} @ ${prereg.committedAt}）`);
    if (range.to === null) {
      console.log(`まだ開けません: ${from} 以降の取り込み済み営業日 ${range.available} / 必要 ${tradingDays}`);
      return;
    }
    to = range.to;
    const ledgerPath = resolve(storeRoot, INGEST_LEDGER_NAME);
    const completed = completedDatesFrom({
      fileNames: readdirSync(storeRoot),
      ledgerContent: existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf-8") : "",
    });
    const missing = missingWeekdays({ from, to, completedDates: completed });
    if (missing.length > 0) {
      throw new HoldoutOpenError(
        `確認期間に取り込みの穴があります（${missing.length}日: ${missing.slice(0, 5).join(", ")}…）。先に取り込んでください`,
      );
    }
    windows = overlappingWindows(manifest, from, to);
    if (windows.length === 0) {
      throw new HoldoutOpenError(`${from}〜${to} は封印の窓と重なりません。開封ではなく研究として扱ってください`);
    }
  } catch (error) {
    if (error instanceof HoldoutOpenError) fail(error.message);
    throw error;
  }

  console.log(`確認期間: ${from} 〜 ${to!}（${tradingDays}営業日）/ 封印の窓 ${windows!.join(", ")}`);
  console.log(
    isEventStudy
      ? `判定    : 主要 horizon のクラスタ補正後 |t| ≥ ${minT}（両側。売買の合否ではない）/ 最小クラスタ ${minClusters}`
      : `合格    : 補正後 t ≥ ${minT} かつ Net 平均 > 0 / 最小クラスタ ${minClusters}`,
  );
  if (!execute) {
    console.log("");
    console.log("計画だけ表示しました（価格は読んでいません）。");
    console.log("--execute を付けると1回だけ実行し、access_log に記録します。**やり直せません。**");
    return;
  }

  console.log("");
  const outcome = isEventStudy
    ? runEventStudyOpen(eventStudyBundle!, to!, minT, minClusters)
    : runBacktestOpen(backtestBundle!, from, to!, minT, minClusters);

  // 封印の窓ごとに1行（既存の照合は窓 ID の一致で行う）。同じ開封なので openedAt と notes は同じ。
  const openedAt = nowJstIso();
  const entries = windows!.map((windowId) => buildAccessEntry({
    edgeId,
    windowId,
    openedAt,
    actor,
    result: outcome.result,
    ...(outcome.netAlphaBps === undefined ? {} : { netAlphaBps: outcome.netAlphaBps }),
    sampleCount: outcome.sampleCount,
    notes: JSON.stringify({
      specId,
      bundle: bundlePath,
      prereg: preregPath,
      preregCommit: prereg.hash,
      from,
      to: to!,
      tradingDays,
      minT,
      minClusters,
      ...outcome.notes,
    }),
  }));
  for (const entry of entries) {
    const entryErrors = validate(entry, loadSchema("holdout-access"));
    if (entryErrors.length > 0) fail(`開封記録がスキーマに適合しません:\n${formatErrors(entryErrors)}`);
  }
  for (const entry of entries) appendJsonl(accessLogPath, entry);

  for (const line of outcome.lines) console.log(line);
  console.log(`記録    : ${accessLogPath}（${entries.map((entry) => entry.id).join(", ")}）`);
  const out = options.get("out");
  if (out) {
    writeGeneratedJson(out, { report: outcome.report, holdoutAccess: entries });
    console.log(`保存    : ${out}`);
  }
}

main();
