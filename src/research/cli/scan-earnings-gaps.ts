/**
 * 決算ギャップ候補の走査。
 *
 *   pnpm scan:earnings-gaps
 *   pnpm scan:earnings-gaps -- --gap-threshold-pct=-7 --min-turnover-jpy=500000000
 *
 * 何を探すか:
 *   決算開示のあと大きく下げたのに、**会社予想の営業利益が減額されていない**銘柄。
 *   「悪材料に見えたが会社の見通しは変わっていない」＝過剰反応の候補。
 *
 * 封印期間:
 *   `research/holdout/vault.manifest.json` を読み、封印の開始日より前で打ち切る。
 *   `--to` で明示しない限り自動で下げる。**黙って封印を覗かない。**
 *   2026-09-11 に、bundle 側へ自前の manifest を書くことで封印が
 *   8ヶ月ぶん狭まった状態で探索した事故があった。既定で正本に従う。
 *
 * 出すもの:
 *   候補と、**落とした理由の内訳**。内訳が無いと「候補0件」の理由が
 *   「該当が無かった」なのか「測れなかった」なのか分からない。
 */

import {
  DEFAULT_EXCLUDED_DOCUMENT_TYPE_PATTERNS,
  generateEarningsGapSignals,
} from "../signals/earnings-gap.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadEarningsDisclosureInputs,
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
  const explicitTo = argValue("to");
  const { to, sealed, violation } = resolveResearchTo(explicitTo);
  if (violation) {
    console.error(`⚠ ${violation}`);
    process.exitCode = 1;
    return;
  }

  const minTurnoverJpy = numberArg("min-turnover-jpy", 500_000_000);
  const gapThresholdPct = numberArg("gap-threshold-pct", -7);
  const from = argValue("from");

  let inputs;
  let disclosures;
  try {
    inputs = loadStudyInputsFromStore({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      minTurnoverJpy,
      excludeNonEquity: !hasFlag("include-non-equity"),
    });
    disclosures = loadEarningsDisclosureInputs(to ? { to } : {});
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
      ? "期間          封印なし（金庫が見つからないので全期間）"
      : `期間          〜 ${to}${explicitTo ? "（明示指定）" : `（封印 ${sealed!.windowId} の前日まで）`}`,
  );
  for (const line of formatStudyInputs(inputs, minTurnoverJpy)) console.log(line);
  console.log(
    `決算開示      ${disclosures.datesScanned}営業日 / ${disclosures.disclosures.length.toLocaleString()}件`
    + `（うち会社予想営業利益なし ${disclosures.withoutForecast.toLocaleString()}件）`,
  );
  console.log(`しきい値      反応日終値が前営業日比 ${gapThresholdPct}% 以下`);
  console.log(`除外する種別  ${DEFAULT_EXCLUDED_DOCUMENT_TYPE_PATTERNS.join(" / ")}`);
  console.log("");

  const prices = new Map<string, PriceSeries>(
    inputs.prices.map((series) => [series.code, series]),
  );
  const result = generateEarningsGapSignals(disclosures.disclosures, prices, {
    gapThresholdPct,
    requireForecastNotCut: true,
    corporateActionDates: inputs.corporateActionDates,
  });

  console.log(`検出          開示 ${result.disclosureCount.toLocaleString()} → 候補 ${result.candidates.length}`);
  const rejectSummary = Object.entries(result.rejectedCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason}=${count.toLocaleString()}`)
    .join(" ");
  if (rejectSummary) console.log(`却下          ${rejectSummary}`);

  if (result.candidates.length === 0) {
    console.log("\n候補なし。");
    return;
  }

  const labeller = makeCodeLabeller(to);
  if (labeller.snapshotDate === null) {
    console.log("（銘柄名なし: 先に pnpm ingest:master を実行するとコードに社名が付きます）");
  }
  const sorted = [...result.candidates].sort((left, right) => left.gapPct - right.gapPct);
  console.log("\n下落が大きい順に20件:");
  for (const candidate of sorted.slice(0, 20)) {
    console.log(
      `  ${labeller.label(candidate.code).padEnd(22)} ${candidate.reactionDate}  ${candidate.gapPct.toFixed(1)}%`
      + `  予想営業利益 ${candidate.previousForecastOperatingProfit ?? "?"} → ${candidate.forecastOperatingProfit ?? "?"}`,
    );
  }
  const median = sorted[Math.floor(sorted.length / 2)]!;
  console.log(
    `\n候補の下落幅: 最大 ${sorted[0]!.gapPct.toFixed(1)}% / 中央 ${median.gapPct.toFixed(1)}%`
    + ` / 最小 ${sorted.at(-1)!.gapPct.toFixed(1)}%`,
  );
  console.log(
    "\n※ これは候補の抽出であって Edge の証拠ではありません。"
    + "\n   コスト控除後の期待値は research:backtest、有意性は FDR で判定します。",
  );
}

main();
