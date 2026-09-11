/**
 * 同業への伝播（read-across）候補の走査。
 *
 *   pnpm scan:read-across
 *   pnpm scan:read-across -- --source-threshold-pct=-10 --related-threshold-pct=-3
 *
 * 何を探すか:
 *   A 社が理由不明で大きく下げた日に、**同じ33業種の B 社も下げた**ケース。
 *   B 社に実害が無ければ過剰反応の可能性がある。
 *   1つの事件から複数の標本が取れるので、供給の細いイベント Edge を
 *   実用的な標本数へ引き上げる経路になる。
 *
 * peer の作り方:
 *   config/company-network.yml の手書き peer は実測で **8社ぶんしかない**。
 *   標本にならないので、銘柄マスタの33業種を peer の代理に使う。
 *   **「同業」であって「関係がある」ではない。** 事業も規模も違う。
 *   config が埋まったらそちらを優先する。
 *
 * 出せないもの:
 *   「B に実害があるか」は価格からは分からない。この走査が言えるのは
 *   「A の下落と同じ日に B も理由不明で下げた」までで、実害の切り分けは
 *   人間または一次情報の仕事。候補は必ず `actual_damage_not_assessed` を持つ。
 */

import { detectAbnormalMoveEvents } from "../signals/abnormal-move-events.js";
import { DEFAULT_MARKET_MODEL_PARAMS } from "../signals/market-model.js";
import { detectReadAcrossEvents } from "../signals/read-across-events.js";
import { sectorPeerGraph } from "../signals/company-relations.js";
import {
  buildSectorPeers,
  loadMasterAsOf,
} from "../providers/jquants-master-store.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadEarningsEventDatesFromStore,
  loadStudyInputsFromStore,
  makeCodeLabeller,
  resolveResearchTo,
} from "../study-inputs-from-store.js";
import type { PriceSeries } from "../backtest.js";

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

function numberArg(name: string, fallback: number): number {
  const raw = argValue(name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number: ${raw}`);
  return parsed;
}

function main(): void {
  const { to, sealed, violation } = resolveResearchTo(argValue("to"));
  if (violation) {
    console.error(`⚠ ${violation}`);
    process.exitCode = 1;
    return;
  }
  const minTurnoverJpy = numberArg("min-turnover-jpy", 500_000_000);
  const sourcePct = numberArg("source-threshold-pct", -10);
  const relatedPct = numberArg("related-threshold-pct", -3);

  let inputs;
  try {
    inputs = loadStudyInputsFromStore({
      ...(to ? { to } : {}), minTurnoverJpy,
      excludeNonEquity: !hasFlag("include-non-equity"),
    });
  } catch (error) {
    if (error instanceof StudyInputsError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  console.log(
    to === null
      ? "期間          封印なし（金庫が見つからない）"
      : `期間          〜 ${to}（${argValue("to") ? "明示指定" : `封印 ${sealed!.windowId} の前日まで`}）`,
  );
  for (const line of formatStudyInputs(inputs, minTurnoverJpy)) console.log(line);

  // 業種は「D 時点で分かっていたもの」を使う。
  const master = loadMasterAsOf(to ?? inputs.tradingDates.at(-1)!);
  if (master.snapshotDate === null) {
    console.error("銘柄マスタがありません。先に pnpm ingest:master を実行してください。");
    process.exitCode = 1;
    return;
  }
  const peers = buildSectorPeers({
    attributes: master.attributes,
    ...(hasFlag("match-scale") ? { matchScaleCategory: true } : {}),
  });
  console.log(
    `業種 peer     ${master.snapshotDate} 時点 / ${peers.peersByCode.size}銘柄が peer を持つ`
    + ` / グループ ${peers.groupCount}（1社だけ ${peers.singletonCount}）`
    + `${hasFlag("match-scale") ? " / 規模区分も一致" : ""}`,
  );

  const knownEventDates = hasFlag("no-earnings-calendar")
    ? new Map<string, Set<string>>()
    : loadEarningsEventDatesFromStore({
        tradingDates: inputs.tradingDates, ...(to ? { to } : {}),
      }).byCode;
  console.log(`決算カレンダー ${knownEventDates.size}銘柄`);
  console.log("");

  // ① 発生元を F1 で取る。**動いていない「事件」から伝播を語らない。**
  const detected = detectAbnormalMoveEvents(inputs.prices, inputs.benchmark, {
    abnormalReturnThresholdPct: sourcePct,
    knownEventDates,
    corporateActionDates: inputs.corporateActionDates,
    marketModel: DEFAULT_MARKET_MODEL_PARAMS,
    minAverageTurnoverJpy: minTurnoverJpy,
  });
  console.log(`① 発生元      評価 ${detected.evaluatedCount.toLocaleString()} → ${detected.candidates.length}件（${sourcePct}%以下）`);

  const securities = new Map<string, PriceSeries>(
    inputs.prices.map((series) => [series.code, series]),
  );
  const result = detectReadAcrossEvents(
    detected.candidates.map((one) => ({ code: one.code, date: one.date })),
    sectorPeerGraph(peers.peersByCode),
    securities,
    inputs.benchmark,
    {
      sourceAbnormalReturnThresholdPct: sourcePct,
      relatedAbnormalReturnThresholdPct: relatedPct,
      knownEventDates,
      corporateActionDates: inputs.corporateActionDates,
      relationTypes: ["peer"],
      minAverageTurnoverJpy: minTurnoverJpy,
    },
  );

  console.log(
    `② 伝播        候補 ${result.candidates.length}件`
    + ` / 伝播した発生元 ${result.propagatedSourceCount}件（${relatedPct}%以下）`,
  );
  const rejectSummary = Object.entries(result.rejectedCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason}=${count.toLocaleString()}`)
    .join(" ");
  if (rejectSummary) console.log(`   却下       ${rejectSummary}`);

  if (result.candidates.length === 0) {
    console.log("\n候補なし。");
    return;
  }

  const labeller = makeCodeLabeller(to);
  const sorted = [...result.candidates]
    .sort((left, right) => left.relatedAbnormalReturnPct - right.relatedAbnormalReturnPct);
  console.log("\n伝播側の下落が大きい順に20件:");
  for (const one of sorted.slice(0, 20)) {
    console.log(
      `  ${one.date}  ${labeller.label(one.sourceCode)} ${one.sourceAbnormalReturnPct.toFixed(1)}%`
      + `  →  ${labeller.label(one.relatedCode)} ${one.relatedAbnormalReturnPct.toFixed(1)}%`
      + `（比 ${one.propagationRatio.toFixed(2)}）`,
    );
  }
  console.log(
    "\n※ 候補はすべて `actual_damage_not_assessed` を持ちます。"
    + "\n   B 社に実害があるかは価格から判定できません。ラベリング前に昇格させないでください。",
  );
}

main();
