// Research OS — 封印（holdout）を開けて、事前登録した確認を1回だけ行う。
//
//   pnpm research:holdout:open --bundle=research/studies/<name>.json \
//     --prereg=docs/research/preregistrations/<name>.md \
//     --from=2026-03-01 --trading-days=189 --min-t=1.96 --actor=<名前>
//     → 計画だけ表示する（価格は読まない）
//   同じ引数に --execute を付ける
//     → 1回だけ実行し、結果を research/holdout/access_log.jsonl に追記する（消せない）
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
  assertNotOpenedBefore,
  assertPreregistrationMatches,
  buildAccessEntry,
  HoldoutOpenError,
  judgeConfirmation,
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

function main(): void {
  const { flags, options } = parseArgs();
  const bundlePath = requiredOption(options, "bundle");
  const preregPath = requiredOption(options, "prereg");
  const from = requiredOption(options, "from");
  const tradingDays = Number(requiredOption(options, "trading-days"));
  const minT = Number(requiredOption(options, "min-t"));
  const actor = requiredOption(options, "actor");
  const execute = flags.has("execute");

  if (!existsSync(bundlePath) || !isCanonicalReadOnlyJsonFile(bundlePath)) {
    fail(`bundle が読めません: ${bundlePath}`);
  }
  const bundle = JSON.parse(readFileSync(bundlePath, "utf-8")) as BacktestStoreBundle;
  const specErrors = validate(bundle.spec, loadSchema("backtest"));
  if (specErrors.length > 0) fail(`spec がスキーマに適合しません:\n${formatErrors(specErrors)}`);
  const edgeId = bundle.spec.edgeId;
  const minTurnoverJpy = bundle.spec.liquidity.minAdtvJpy;
  if (minTurnoverJpy === undefined) fail("spec.liquidity.minAdtvJpy がありません（流動性の下限は bundle で決める）");

  if (!existsSync(preregPath)) fail(`事前登録がありません: ${preregPath}`);
  const prereg = gitCommitOf(preregPath);
  const accessLogPath = paths.holdoutAccessLog();
  const accessLog = readJsonl(accessLogPath) as { edgeId: string; purpose: string; openedAt: string; id: string }[];
  const manifest = JSON.parse(readFileSync(paths.holdoutManifest(), "utf-8")) as HoldoutVaultManifest;

  const storeRoot = resolveStoreRoot();
  let to: string;
  let windows: string[];
  try {
    assertPreregistrationMatches(readFileSync(preregPath, "utf-8"), { bundlePath, from, tradingDays });
    assertNotOpenedBefore(accessLog, edgeId);
    const range = resolveConfirmationRange({ tradingDates: listIngestedDates(storeRoot), from, tradingDays });
    console.log(`Edge    : ${edgeId}（spec ${bundle.spec.id} / ${bundle.spec.side}）`);
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
  console.log(`合格    : 補正後 t ≥ ${minT} かつ Net 平均 > 0`);
  if (!execute) {
    console.log("");
    console.log("計画だけ表示しました（価格は読んでいません）。");
    console.log("--execute を付けると1回だけ実行し、access_log に記録します。**やり直せません。**");
    return;
  }

  console.log("");
  let signals;
  let built;
  try {
    built = buildFromStore(bundle, { to: to!, minTurnoverJpy: minTurnoverJpy!, useEarningsCalendar: true });
    signals = built.signals.filter((signal) => {
      const date = jstDateOf(signal.observedAt);
      return date >= from && date <= to!;
    });
    console.log(`確認期間のシグナル: ${signals.length}（全期間 ${built.signals.length} のうち）`);
    if (bundle.filters?.lendableOnly) signals = applyLendableFilter(signals, to!);
  } catch (error) {
    if (error instanceof StoreRunError) fail(error.message);
    throw error;
  }

  const report = runBacktest(
    bundle.spec,
    signals,
    buildUniquePriceSeriesMap(built.prices),
    built.benchmark,
    { corporateActionDates: built.corporateActionDates },
  );
  const judged = judgeConfirmation({
    clusteredTStat: report.net.clusteredTStat,
    meanNetAlphaBps: report.net.meanNetAlphaBps,
    executedCount: report.executedCount,
    minT,
  });
  // 封印の窓ごとに1行（既存の照合は窓 ID の一致で行う）。同じ開封なので openedAt と notes は同じ。
  const openedAt = nowJstIso();
  const entries = windows!.map((windowId) => buildAccessEntry({
    edgeId,
    windowId,
    openedAt,
    actor,
    result: judged.result,
    netAlphaBps: report.net.meanNetAlphaBps,
    sampleCount: report.executedCount,
    notes: JSON.stringify({
      specId: bundle.spec.id,
      bundle: bundlePath,
      prereg: preregPath,
      preregCommit: prereg.hash,
      from,
      to: to!,
      tradingDays,
      minT,
      clusteredTStat: report.net.clusteredTStat,
      clusterCount: report.net.clusterCount,
      clusteredMeanNetAlphaBps: report.net.clusteredMeanNetAlphaBps,
      signalCount: report.signalCount,
      reason: judged.reason,
    }),
  }));
  for (const entry of entries) {
    const entryErrors = validate(entry, loadSchema("holdout-access"));
    if (entryErrors.length > 0) fail(`開封記録がスキーマに適合しません:\n${formatErrors(entryErrors)}`);
  }
  for (const entry of entries) appendJsonl(accessLogPath, entry);

  console.log(`シグナル ${report.signalCount} 件 / 約定 ${report.executedCount} 件`);
  console.log(`Net 平均 ${report.net.meanNetAlphaBps.toFixed(1)}bps / 中央値 ${report.net.medianNetAlphaBps.toFixed(1)}bps`);
  console.log(
    `クラスタ平均 ${report.net.clusteredMeanNetAlphaBps?.toFixed(1) ?? "n/a"}bps（${report.net.clusterCount ?? 0}日）`
    + ` / t = ${report.net.clusteredTStat?.toFixed(4) ?? "n/a"}`,
  );
  console.log(`判定    : ${judged.result.toUpperCase()} — ${judged.reason}`);
  console.log(`記録    : ${accessLogPath}（${entries.map((entry) => entry.id).join(", ")}）`);
  const out = options.get("out");
  if (out) {
    writeGeneratedJson(out, { ...report, holdoutAccess: entries });
    console.log(`保存    : ${out}`);
  }
}

main();
