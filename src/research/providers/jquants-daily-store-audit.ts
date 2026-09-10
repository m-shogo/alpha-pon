/**
 * 取り込んだ価格ストアの健全性検査。
 *
 * このストアは F1・イベントスタディ・backtest すべての土台になった。
 * 静かに壊れると、その先の測定は「動いているが間違っている」状態になり、
 * 候補件数を見ても気づけない。壊れ方を先に列挙して、毎回検査する。
 *
 * 検査は**取り込み済みのぶんだけ**を見る。取り込みが途中でも走らせられる
 * ようにしておかないと、CI で回せず結局誰も走らせない。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validatePriceRecordHardening } from "../price-store-hardening.js";
import type { PitPriceRecord } from "../price-store.js";
import {
  JQUANTS_ADJUSTMENT_LEDGER_NAME,
  dedupeAdjustmentEvents,
  parseAdjustmentLedger,
} from "./jquants-adjustment-events.js";
import { listIngestedDates, readDateRecords, resolveStoreRoot } from "./jquants-daily-store.js";

export interface PriceStoreAuditFinding {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface PriceStoreAuditReport {
  datesAudited: number;
  rowsAudited: number;
  findings: PriceStoreAuditFinding[];
  /** 参考値。異常判定には使わないが、人が眺めて気づくために出す。 */
  stats: {
    firstDate: string | null;
    lastDate: string | null;
    minRowsPerDay: number;
    maxRowsPerDay: number;
    medianRowsPerDay: number;
    minTradedRatio: number;
    maxTradedRatio: number;
    adjustmentEvents: number;
  };
}

export interface PriceStoreAuditOptions {
  root?: string;
  /** 全件走査は重いので、既定では等間隔に抜き取る。0 なら全件。 */
  sampleDates?: number;
  /** 1営業日あたりの行数がこれを下回ったら異常とみなす。 */
  minRowsPerDay?: number;
  /** 板が立った行の割合がこれを下回ったら異常とみなす。 */
  minTradedRatio?: number;
}

const DEFAULT_MIN_ROWS_PER_DAY = 3_000;
// 実測（2026-09-11）: 板が立たない行は 3.4〜4.1%。余裕を見て 0.90。
const DEFAULT_MIN_TRADED_RATIO = 0.9;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * 全件走査は重い。等間隔に抜き取る。
 *
 * 先頭と末尾は必ず含める。取り込みの切れ目は末尾に出るので、そこを
 * 落とすと「途中で切れた」を見逃す。等間隔の刻みは i=0 と i=count-1 で
 * ちょうど両端に当たるため明示は冗長だが、刻み方を変えたときの
 * 保険として残す（変異テストでは等価と判定される）。
 */
function sample(dates: string[], count: number): string[] {
  if (count <= 0 || dates.length <= count) return dates;
  const picked = new Set<string>([dates[0]!, dates.at(-1)!]);
  const step = (dates.length - 1) / (count - 1);
  for (let i = 0; i < count; i += 1) picked.add(dates[Math.round(i * step)]!);
  return [...picked].sort();
}

export function auditPriceStore(options: PriceStoreAuditOptions = {}): PriceStoreAuditReport {
  const root = options.root ?? resolveStoreRoot();
  const minRowsPerDay = options.minRowsPerDay ?? DEFAULT_MIN_ROWS_PER_DAY;
  const minTradedRatio = options.minTradedRatio ?? DEFAULT_MIN_TRADED_RATIO;
  const findings: PriceStoreAuditFinding[] = [];
  const add = (severity: "error" | "warning", code: string, message: string): void => {
    findings.push({ severity, code, message });
  };

  const allDates = listIngestedDates(root);
  const dates = sample(allDates, options.sampleDates ?? 40);

  const rowsPerDay: number[] = [];
  const tradedRatios: number[] = [];
  let rowsAudited = 0;

  for (const tradingDate of dates) {
    const records = readDateRecords(tradingDate, root);
    rowsAudited += records.length;
    rowsPerDay.push(records.length);

    if (records.length < minRowsPerDay) {
      add("error", "too_few_rows",
        `${tradingDate}: ${records.length}行しかない（下限 ${minRowsPerDay}）。取り込みが途中で切れた疑い`);
    }

    const seen = new Set<string>();
    let traded = 0;
    for (const record of records) {
      if (record.tradingDate !== tradingDate) {
        add("error", "foreign_trading_date",
          `${tradingDate}.jsonl に ${record.code} の ${record.tradingDate} の行が混ざっている`);
      }
      if (seen.has(record.code)) {
        add("error", "duplicate_code",
          `${tradingDate}: ${record.code} が重複している。改訂の解決が必要になる`);
      }
      seen.add(record.code);
      if (record.status === "traded") traded += 1;

      // 3.8%の行が hardening を通らない状態で気づかず走っていた前例がある。
      for (const issue of validatePriceRecordHardening(record as PitPriceRecord)) {
        add("error", "hardening", `${tradingDate} ${record.code}: ${issue.message}`);
      }
    }

    const ratio = records.length > 0 ? traded / records.length : 0;
    tradedRatios.push(ratio);
    if (records.length > 0 && ratio < minTradedRatio) {
      add("error", "traded_ratio_too_low",
        `${tradingDate}: 板が立った行が ${(ratio * 100).toFixed(1)}%（下限 ${(minTradedRatio * 100).toFixed(0)}%）`);
    }
  }

  // 権利落ち台帳。矛盾があれば dedupe が投げる。
  let adjustmentEvents = 0;
  try {
    const path = resolve(root, JQUANTS_ADJUSTMENT_LEDGER_NAME);
    const content = readFileSync(path, "utf-8");
    const events = dedupeAdjustmentEvents(parseAdjustmentLedger(content));
    adjustmentEvents = events.length;
    for (const event of events) {
      if (event.factor === 1) {
        add("error", "adjustment_factor_one",
          `${event.code} ${event.effectiveDate}: factor=1 はイベントではない`);
      }
      if (allDates.length > 0 && (event.effectiveDate < allDates[0]! || event.effectiveDate > allDates.at(-1)!)) {
        add("warning", "adjustment_outside_ingested_range",
          `${event.code} ${event.effectiveDate}: 取り込み済みの期間の外`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ENOENT/.test(message)) {
      add("error", "adjustment_ledger", `権利落ち台帳を読めない: ${message}`);
    } else if (allDates.length > 0) {
      add("warning", "adjustment_ledger_missing",
        "権利落ち台帳が無い。分割を暴落として検出する状態");
    }
  }

  return {
    datesAudited: dates.length,
    rowsAudited,
    findings,
    stats: {
      firstDate: allDates[0] ?? null,
      lastDate: allDates.at(-1) ?? null,
      minRowsPerDay: rowsPerDay.length ? Math.min(...rowsPerDay) : 0,
      maxRowsPerDay: rowsPerDay.length ? Math.max(...rowsPerDay) : 0,
      medianRowsPerDay: median(rowsPerDay),
      minTradedRatio: tradedRatios.length ? Math.min(...tradedRatios) : 0,
      maxTradedRatio: tradedRatios.length ? Math.max(...tradedRatios) : 0,
      adjustmentEvents,
    },
  };
}
