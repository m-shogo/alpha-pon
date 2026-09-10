// Signal 生成で共通に使う暦計算。
//
// 売買停止・上場後の空白があると「1日の値動き」が実際には数十日分の変化になる。
// その判定を各 Signal Generator で二重実装しないためにここへ集約する。

const MS_PER_DAY = 86_400_000;

/** JST 暦日どうしの日数差。両方 YYYY-MM-DD 前提。 */
export function calendarDaysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new Error(`invalid calendar date range: ${from} -> ${to}`);
  }
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

export function positiveDayLimit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error(`${label} must be a positive integer: ${resolved}`);
  }
  return resolved;
}

/** 価格系列が日付昇順で重複が無いことを確かめる。順序が崩れた入力で黙って計算しない。 */
export function assertAscendingBars(series: { code: string; bars: readonly { date: string }[] }): void {
  for (let index = 1; index < series.bars.length; index += 1) {
    if (series.bars[index - 1].date >= series.bars[index].date) {
      throw new Error(
        `price series ${series.code} must be strictly ascending by date: ` +
          `${series.bars[index - 1].date} -> ${series.bars[index].date}`,
      );
    }
  }
}
