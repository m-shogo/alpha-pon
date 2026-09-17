// Research OS — 売りのシグナルを「その日に制度信用で売れた銘柄」に絞る。
//
// 判定はシグナル日（observedAt の JST 日付）以前で最新の貸借区分。
// 区分が分からない銘柄は、売れたかどうか分からないので落とす（fail closed）。

import type { BacktestSignal } from "../backtest.js";
import { jstDateOf } from "../pit.js";

export interface LendableFilterResult {
  kept: BacktestSignal[];
  notLendable: number;
  unknown: number;
}

export function filterLendableSignals(
  signals: readonly BacktestSignal[],
  marginTypeOn: (code: string, date: string) => string | null,
  lendableValue: string,
): LendableFilterResult {
  const kept: BacktestSignal[] = [];
  let notLendable = 0;
  let unknown = 0;
  for (const signal of signals) {
    const value = marginTypeOn(signal.code, jstDateOf(signal.observedAt));
    if (value === null) unknown += 1;
    else if (value !== lendableValue) notLendable += 1;
    else kept.push(signal);
  }
  return { kept, notLendable, unknown };
}
