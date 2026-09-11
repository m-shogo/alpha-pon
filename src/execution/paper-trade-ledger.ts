// 紙トレード帳簿。
//
// 目的:
//   「計画したこと」と「実際に起きたこと」の差を測る。
//
// なぜ必要か:
//   backtest は **全てのシグナルが想定価格で約定する** ことを暗黙に前提にしている。
//   現実には、寄らない・ストップ安・板が薄い・そもそも発注し忘れる、が起きる。
//   約定率と滑りを測らない限り、backtest の数字が現実と乖離しても気づけない。
//   とくに **約定しなかった計画を数えない** と、
//   「一番おいしい事例だけ実際には買えなかった」という
//   系統的な過大評価が見えないまま残る。
//
// 設計方針:
//   - append-only。起きたことを後から書き換えない。
//   - 未約定を必ず数える。約定した分だけで成績を語らない。
//   - 存在しない計画への約定記録、未約定への決済記録を拒否する。
//   - 二重約定・二重決済を拒否する。
//   - **時間が戻る記録を拒否する。** 計画より前の約定、約定より前の決済、
//     期限切れ後の約定、計画株数を超える約定は、どれも別の取引の数字が
//     この計画の成績として混ざる。混ざると約定率も滑りも意味を失う。
//   - 判断は純関数。ファイル IO は薄く分ける。

import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { formatJstDate } from "../date.js";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "../research/iso-instant.js";

export const DEFAULT_PAPER_TRADE_LEDGER_PATH = "data/paper_trades.jsonl";

export const PAPER_EXIT_REASONS = ["stop", "target", "horizon", "invalidated", "manual"] as const;
export type PaperExitReason = (typeof PAPER_EXIT_REASONS)[number];

export interface PaperTradeIntent {
  schemaVersion: 1;
  kind: "intent";
  intentId: string;
  signalId: string;
  edgeId: string;
  code: string;
  side: "long" | "short";
  plannedEntryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  plannedShares: number;
  validUntil: string;
  recordedAt: string;
}

export interface PaperTradeFill {
  schemaVersion: 1;
  kind: "fill";
  intentId: string;
  filledAt: string;
  filledPrice: number;
  filledShares: number;
  /** 手数料・税を含む実費（円）。 */
  feesJpy: number;
  recordedAt: string;
}

export interface PaperTradeExit {
  schemaVersion: 1;
  kind: "exit";
  intentId: string;
  exitedAt: string;
  exitPrice: number;
  reason: PaperExitReason;
  feesJpy: number;
  recordedAt: string;
}

/** 期限までに約定しなかった計画。**必ず記録する。** */
export interface PaperTradeUnfilled {
  schemaVersion: 1;
  kind: "unfilled";
  intentId: string;
  reason: string;
  recordedAt: string;
}

export type PaperTradeRecord =
  | PaperTradeIntent | PaperTradeFill | PaperTradeExit | PaperTradeUnfilled;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODE_PATTERN = /^[0-9A-Z]{4,5}$/;

function assertNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`paper trade ${field} must be a non-empty string`);
  }
  return value;
}

function assertPositive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`paper trade ${field} must be a positive finite number: ${String(value)}`);
  }
  return value;
}

function assertNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`paper trade ${field} must be a non-negative finite number: ${String(value)}`);
  }
  return value;
}

/** 瞬時を JST の暦日に落とす。期限は暦日で切る。 */
function jstDateOf(instant: string, label: string): string {
  return formatJstDate(new Date(parseExplicitIso8601Instant(instant, label)));
}

function assertRecord(record: PaperTradeRecord, label: string): void {
  if (record.schemaVersion !== 1) throw new Error(`${label} schemaVersion must be 1`);
  assertNonEmpty(record.intentId, "intentId");
  parseExplicitIso8601Instant(record.recordedAt, `${label} recordedAt`);

  if (record.kind === "intent") {
    assertNonEmpty(record.signalId, "signalId");
    assertNonEmpty(record.edgeId, "edgeId");
    const code = assertNonEmpty(record.code, "code").trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) throw new Error(`paper trade code must be 4-5 alphanumeric: ${record.code}`);
    if (record.side !== "long" && record.side !== "short") {
      throw new Error(`paper trade side must be long or short: ${record.side}`);
    }
    assertPositive(record.plannedEntryPrice, "plannedEntryPrice");
    assertPositive(record.stopPrice, "stopPrice");
    if (!Number.isSafeInteger(record.plannedShares) || record.plannedShares < 1) {
      throw new Error("paper trade plannedShares must be a positive safe integer");
    }
    if (!ISO_DATE_PATTERN.test(record.validUntil)) {
      throw new Error(`paper trade validUntil must be YYYY-MM-DD: ${record.validUntil}`);
    }
    const wrongStop = record.side === "long"
      ? record.stopPrice >= record.plannedEntryPrice
      : record.stopPrice <= record.plannedEntryPrice;
    if (wrongStop) throw new Error("paper trade stopPrice must be on the losing side of plannedEntryPrice");
  } else if (record.kind === "fill") {
    parseExplicitIso8601Instant(record.filledAt, `${label} filledAt`);
    assertPositive(record.filledPrice, "filledPrice");
    if (!Number.isSafeInteger(record.filledShares) || record.filledShares < 1) {
      throw new Error("paper trade filledShares must be a positive safe integer");
    }
    assertNonNegative(record.feesJpy, "feesJpy");
  } else if (record.kind === "exit") {
    parseExplicitIso8601Instant(record.exitedAt, `${label} exitedAt`);
    assertPositive(record.exitPrice, "exitPrice");
    assertNonNegative(record.feesJpy, "feesJpy");
    if (!PAPER_EXIT_REASONS.includes(record.reason)) {
      throw new Error(`unknown paper trade exit reason: ${record.reason}`);
    }
  } else if (record.kind === "unfilled") {
    assertNonEmpty(record.reason, "reason");
  } else {
    throw new Error(`unknown paper trade record kind: ${(record as { kind: string }).kind}`);
  }
}

export function parsePaperTradeLedger(content: string, sourceName = "<memory>"): PaperTradeRecord[] {
  const records: PaperTradeRecord[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    let parsed: PaperTradeRecord;
    try {
      parsed = JSON.parse(line) as PaperTradeRecord;
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1} の JSON を解析できません: ${(error as Error).message}`);
    }
    assertRecord(parsed, `${sourceName}:${index + 1}`);
    records.push(parsed);
  }
  return records;
}

export function readPaperTradeLedger(
  path: string = DEFAULT_PAPER_TRADE_LEDGER_PATH,
): PaperTradeRecord[] {
  if (!existsSync(path)) return [];
  return parsePaperTradeLedger(readFileSync(path, "utf-8"), path);
}

function append(path: string, record: PaperTradeRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "a");
  try {
    appendFileSync(fd, `${JSON.stringify(record)}\n`, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function indexOfKind(records: readonly PaperTradeRecord[], intentId: string, kind: PaperTradeRecord["kind"]) {
  return records.find((one) => one.intentId === intentId && one.kind === kind);
}

export function appendPaperTradeRecord(
  record: PaperTradeRecord,
  path: string = DEFAULT_PAPER_TRADE_LEDGER_PATH,
): { appended: boolean } {
  assertRecord(record, "paper trade record");
  const existing = readPaperTradeLedger(path);

  const intent = indexOfKind(existing, record.intentId, "intent") as PaperTradeIntent | undefined;
  if (record.kind === "intent") {
    if (intent) throw new Error(`duplicate paper trade intent: ${record.intentId}`);
  } else if (!intent) {
    throw new Error(`cannot record ${record.kind} for an unknown intent: ${record.intentId}`);
  }

  if (record.kind === "fill") {
    if (indexOfKind(existing, record.intentId, "fill")) {
      throw new Error(`paper trade ${record.intentId} is already filled`);
    }
    if (indexOfKind(existing, record.intentId, "unfilled")) {
      throw new Error(`paper trade ${record.intentId} was already recorded as unfilled`);
    }
    // 計画より前に約定はできない。時間が戻る記録を通すと、
    // 「その計画で買えたのか」という問いそのものが成立しなくなる。
    if (compareExplicitIso8601Instants(
      record.filledAt, intent!.recordedAt, "fill.filledAt", "intent.recordedAt",
    ) < 0) {
      throw new Error(
        `paper trade ${record.intentId}: 約定 ${record.filledAt} が`
        + ` 計画の記録時刻 ${intent!.recordedAt} より前です`,
      );
    }
    // 期限切れの計画に約定を足すと、約定率は実際より高く、
    // 滑りは別の相場の数字になる。どちらも backtest との比較を壊す。
    const filledDate = jstDateOf(record.filledAt, "fill.filledAt");
    if (filledDate > intent!.validUntil) {
      throw new Error(
        `paper trade ${record.intentId}: 約定日 ${filledDate} が`
        + ` 期限 ${intent!.validUntil} を過ぎています。`
        + "期限内に約定しなかったなら unfilled を、別の取引なら新しい intent を記録してください",
      );
    }
    if (record.filledShares > intent!.plannedShares) {
      throw new Error(
        `paper trade ${record.intentId}: 約定株数 ${record.filledShares} が`
        + ` 計画株数 ${intent!.plannedShares} を超えています`,
      );
    }
  }
  if (record.kind === "unfilled") {
    if (indexOfKind(existing, record.intentId, "fill")) {
      throw new Error(`paper trade ${record.intentId} is already filled; it cannot be unfilled`);
    }
    if (indexOfKind(existing, record.intentId, "unfilled")) return { appended: false };
  }
  if (record.kind === "exit") {
    const fill = indexOfKind(existing, record.intentId, "fill") as PaperTradeFill | undefined;
    if (!fill) {
      throw new Error(`cannot exit a paper trade that was never filled: ${record.intentId}`);
    }
    if (indexOfKind(existing, record.intentId, "exit")) {
      throw new Error(`paper trade ${record.intentId} is already closed`);
    }
    // 約定より前の決済は保有期間が負になる。
    // それでもリターンは計算できてしまうので、**利益に見える誤りが残る。**
    if (compareExplicitIso8601Instants(
      record.exitedAt, fill.filledAt, "exit.exitedAt", "fill.filledAt",
    ) < 0) {
      throw new Error(
        `paper trade ${record.intentId}: 決済 ${record.exitedAt} が`
        + ` 約定 ${fill.filledAt} より前です`,
      );
    }
  }

  append(path, record);
  return { appended: true };
}

export interface PaperTradeOutcome {
  intentId: string;
  edgeId: string;
  code: string;
  side: "long" | "short";
  status: "open" | "closed" | "unfilled";
  plannedEntryPrice: number;
  filledPrice?: number;
  /** 計画価格に対する滑り。**正が不利**（ロングで高く買う / ショートで安く売る）。 */
  slippageBps?: number;
  /** 計画株数に対する実約定株数の比。 */
  fillRatio?: number;
  exitPrice?: number;
  exitReason?: PaperExitReason;
  grossReturnBps?: number;
  netReturnBps?: number;
  feesJpy: number;
}

export interface PaperTradeReconciliation {
  outcomes: PaperTradeOutcome[];
  intentCount: number;
  filledCount: number;
  unfilledCount: number;
  openCount: number;
  closedCount: number;
  /** 約定率。backtest は 100% を前提にしている。 */
  fillRate: number | null;
  /** 約定した取引の平均滑り。 */
  meanSlippageBps: number | null;
  /** 決済済み取引の平均 Net リターン。 */
  meanNetReturnBps: number | null;
  warnings: string[];
}

function returnBps(entry: number, exit: number, side: "long" | "short"): number {
  const raw = (exit - entry) / entry;
  return (side === "long" ? raw : -raw) * 10_000;
}

/**
 * 計画と実績を突き合わせる。
 *
 * 約定しなかった計画を必ず数える。約定した分だけで成績を語ると、
 * 「買えなかった事例」が消えて系統的に良く見える。
 */
export function reconcilePaperTrades(records: readonly PaperTradeRecord[]): PaperTradeReconciliation {
  const intents = records.filter((one): one is PaperTradeIntent => one.kind === "intent");
  const outcomes: PaperTradeOutcome[] = [];
  // append を経由せず手で書かれた台帳を読むこともある。そこで気づけるようにする。
  const inconsistentStops: string[] = [];

  for (const intent of [...intents].sort((left, right) =>
    left.intentId < right.intentId ? -1 : left.intentId > right.intentId ? 1 : 0,
  )) {
    const fill = indexOfKind(records, intent.intentId, "fill") as PaperTradeFill | undefined;
    const exit = indexOfKind(records, intent.intentId, "exit") as PaperTradeExit | undefined;
    const unfilled = indexOfKind(records, intent.intentId, "unfilled");

    if (!fill) {
      outcomes.push({
        intentId: intent.intentId,
        edgeId: intent.edgeId,
        code: intent.code,
        side: intent.side,
        status: unfilled ? "unfilled" : "open",
        plannedEntryPrice: intent.plannedEntryPrice,
        feesJpy: 0,
      });
      continue;
    }

    const feesJpy = fill.feesJpy + (exit?.feesJpy ?? 0);
    const outcome: PaperTradeOutcome = {
      intentId: intent.intentId,
      edgeId: intent.edgeId,
      code: intent.code,
      side: intent.side,
      status: exit ? "closed" : "open",
      plannedEntryPrice: intent.plannedEntryPrice,
      filledPrice: fill.filledPrice,
      slippageBps: returnBps(intent.plannedEntryPrice, fill.filledPrice, intent.side),
      fillRatio: fill.filledShares / intent.plannedShares,
      feesJpy,
    };
    if (exit) {
      // 「ストップで降りた」と書かれているのに、ストップより有利な値段で
      // 降りている。どちらかが事実でない。
      const stopNotReached = intent.side === "long"
        ? exit.exitPrice > intent.stopPrice
        : exit.exitPrice < intent.stopPrice;
      if (exit.reason === "stop" && stopNotReached) {
        inconsistentStops.push(intent.intentId);
      }
      const gross = returnBps(fill.filledPrice, exit.exitPrice, intent.side);
      const notional = fill.filledPrice * fill.filledShares;
      outcome.exitPrice = exit.exitPrice;
      outcome.exitReason = exit.reason;
      outcome.grossReturnBps = gross;
      outcome.netReturnBps = notional > 0 ? gross - (feesJpy / notional) * 10_000 : gross;
    }
    outcomes.push(outcome);
  }

  const filled = outcomes.filter((one) => one.filledPrice !== undefined);
  const closed = outcomes.filter((one) => one.status === "closed");
  const unfilledCount = outcomes.filter((one) => one.status === "unfilled").length;
  const openCount = outcomes.filter((one) => one.status === "open").length;
  const decided = filled.length + unfilledCount;

  const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

  const warnings: string[] = [];
  const fillRate = decided === 0 ? null : filled.length / decided;
  if (fillRate !== null && fillRate < 1) {
    warnings.push(
      `約定率 ${(fillRate * 100).toFixed(0)}%（${filled.length}/${decided}）。`
      + "backtest は全件約定を前提にしているため、その分だけ実績より良く出ます",
    );
  }
  if (openCount > 0) {
    warnings.push(`未決着 ${openCount} 件は成績に含めていません`);
  }
  const partialFills = filled.filter((one) => (one.fillRatio ?? 1) < 1).length;
  if (partialFills > 0) {
    warnings.push(`部分約定 ${partialFills} 件。計画株数に届いていません`);
  }
  const overFills = filled.filter((one) => (one.fillRatio ?? 1) > 1).length;
  if (overFills > 0) {
    warnings.push(
      `過大約定 ${overFills} 件。計画株数を超えています`
      + "（appendPaperTradeRecord は拒否するので、手で書かれた行です）",
    );
  }
  if (inconsistentStops.length > 0) {
    warnings.push(
      `決済理由が stop なのにストップ価格より有利な値段で降りている記録が`
      + ` ${inconsistentStops.length} 件: ${inconsistentStops.slice(0, 5).join(", ")}`,
    );
  }

  return {
    outcomes,
    intentCount: intents.length,
    filledCount: filled.length,
    unfilledCount,
    openCount,
    closedCount: closed.length,
    fillRate,
    meanSlippageBps: mean(filled.map((one) => one.slippageBps ?? 0)),
    meanNetReturnBps: mean(closed.map((one) => one.netReturnBps ?? 0)),
    warnings,
  };
}
