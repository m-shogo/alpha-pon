// 紙トレード帳簿のテスト。
//
// 守りたい性質:
//   1. 約定しなかった計画を必ず数える（約定分だけで成績を語らない）
//   2. append-only。存在しない計画への記録、二重約定・二重決済を拒否する
//   3. 滑りを計画価格との差で測る
//   4. 未決着を成績に混ぜない

import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPaperTradeRecord,
  readPaperTradeLedger,
  reconcilePaperTrades,
  type PaperTradeExit,
  type PaperTradeFill,
  type PaperTradeIntent,
} from "../src/execution/paper-trade-ledger.js";

const dir = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-paper-"));
const AT = "2026-09-11T09:00:00+09:00";

function ledger(name: string): string {
  return join(dir, `${name}.jsonl`);
}

function intent(over: Partial<PaperTradeIntent> = {}): PaperTradeIntent {
  return {
    schemaVersion: 1, kind: "intent",
    intentId: "i-1", signalId: "sig-1", edgeId: "edge-a",
    code: "8136", side: "long",
    plannedEntryPrice: 1000, stopPrice: 900, targetPrice: 1200,
    plannedShares: 300, validUntil: "2026-09-12", recordedAt: AT,
    ...over,
  };
}

function fill(over: Partial<PaperTradeFill> = {}): PaperTradeFill {
  return {
    schemaVersion: 1, kind: "fill", intentId: "i-1",
    filledAt: AT, filledPrice: 1005, filledShares: 300, feesJpy: 500, recordedAt: AT,
    ...over,
  };
}

function exitRecord(over: Partial<PaperTradeExit> = {}): PaperTradeExit {
  return {
    schemaVersion: 1, kind: "exit", intentId: "i-1",
    exitedAt: "2026-10-09T15:00:00+09:00", exitPrice: 1100,
    reason: "horizon", feesJpy: 500, recordedAt: AT,
    ...over,
  };
}

try {
  function testSlippageIsMeasuredAgainstThePlan() {
    const p = ledger("slippage");
    appendPaperTradeRecord(intent(), p);
    appendPaperTradeRecord(fill(), p);
    const result = reconcilePaperTrades(readPaperTradeLedger(p));
    const [outcome] = result.outcomes;
    assert.equal(outcome.status, "open");
    assert.equal(Math.round(outcome.slippageBps ?? 0), 50, "1000 → 1005 で 50bps 不利");
    assert.equal(outcome.fillRatio, 1);
  }

  function testUnfilledIsCountedNotIgnored() {
    const p = ledger("unfilled");
    appendPaperTradeRecord(intent({ intentId: "i-1" }), p);
    appendPaperTradeRecord(intent({ intentId: "i-2" }), p);
    appendPaperTradeRecord(fill({ intentId: "i-1" }), p);
    appendPaperTradeRecord(
      { schemaVersion: 1, kind: "unfilled", intentId: "i-2", reason: "ストップ安で寄らず", recordedAt: AT },
      p,
    );
    const result = reconcilePaperTrades(readPaperTradeLedger(p));
    assert.equal(result.filledCount, 1);
    assert.equal(result.unfilledCount, 1);
    assert.equal(result.fillRate, 0.5);
    assert.ok(
      result.warnings.some((one) => one.includes("約定率 50%") && one.includes("全件約定を前提")),
      "backtest との前提の違いを明示する",
    );
  }

  function testClosedTradeNetsOutFees() {
    const p = ledger("closed");
    appendPaperTradeRecord(intent(), p);
    appendPaperTradeRecord(fill(), p);
    appendPaperTradeRecord(exitRecord(), p);
    const [outcome] = reconcilePaperTrades(readPaperTradeLedger(p)).outcomes;
    assert.equal(outcome.status, "closed");
    assert.equal(Math.round(outcome.grossReturnBps ?? 0), 945, "1005 → 1100");
    assert.ok((outcome.netReturnBps ?? 0) < (outcome.grossReturnBps ?? 0), "手数料を引く");
    assert.equal(outcome.feesJpy, 1000, "往復の手数料を合算する");
  }

  function testOpenTradesAreNotCountedInPerformance() {
    const p = ledger("open");
    appendPaperTradeRecord(intent({ intentId: "i-1" }), p);
    appendPaperTradeRecord(fill({ intentId: "i-1" }), p);
    appendPaperTradeRecord(exitRecord({ intentId: "i-1" }), p);
    appendPaperTradeRecord(intent({ intentId: "i-2" }), p);
    appendPaperTradeRecord(fill({ intentId: "i-2", filledPrice: 1000 }), p);
    const result = reconcilePaperTrades(readPaperTradeLedger(p));
    assert.equal(result.closedCount, 1);
    assert.equal(result.openCount, 1);
    assert.ok(result.warnings.some((one) => one.includes("未決着 1 件")));
  }

  function testPartialFillIsSurfaced() {
    const p = ledger("partial");
    appendPaperTradeRecord(intent(), p);
    appendPaperTradeRecord(fill({ filledShares: 100 }), p);
    const result = reconcilePaperTrades(readPaperTradeLedger(p));
    assert.equal(result.outcomes[0].fillRatio, 1 / 3);
    assert.ok(result.warnings.some((one) => one.includes("部分約定 1 件")));
  }

  function testShortSideSlippageAndReturn() {
    const p = ledger("short");
    appendPaperTradeRecord(intent({ side: "short", plannedEntryPrice: 1000, stopPrice: 1100 }), p);
    appendPaperTradeRecord(fill({ filledPrice: 995 }), p);
    appendPaperTradeRecord(exitRecord({ exitPrice: 900 }), p);
    const [outcome] = reconcilePaperTrades(readPaperTradeLedger(p)).outcomes;
    assert.equal(Math.round(outcome.slippageBps ?? 0), 50, "ショートは安く売ると不利");
    assert.ok((outcome.grossReturnBps ?? 0) > 0, "下がって利益");
  }

  function testUnknownIntentIsRejected() {
    const p = ledger("unknown");
    assert.throws(
      () => appendPaperTradeRecord(fill({ intentId: "nope" }), p),
      /unknown intent/,
    );
  }

  function testDoubleFillAndDoubleExitAreRejected() {
    const p = ledger("double");
    appendPaperTradeRecord(intent(), p);
    appendPaperTradeRecord(fill(), p);
    assert.throws(() => appendPaperTradeRecord(fill(), p), /already filled/);
    appendPaperTradeRecord(exitRecord(), p);
    assert.throws(() => appendPaperTradeRecord(exitRecord(), p), /already closed/);
  }

  function testExitWithoutFillIsRejected() {
    const p = ledger("no-fill-exit");
    appendPaperTradeRecord(intent(), p);
    assert.throws(
      () => appendPaperTradeRecord(exitRecord(), p),
      /never filled/,
      "約定していない計画を決済できてはいけない",
    );
  }

  function testFilledCannotBecomeUnfilled() {
    const p = ledger("flip");
    appendPaperTradeRecord(intent(), p);
    appendPaperTradeRecord(fill(), p);
    assert.throws(
      () => appendPaperTradeRecord(
        { schemaVersion: 1, kind: "unfilled", intentId: "i-1", reason: "後付け", recordedAt: AT },
        p,
      ),
      /cannot be unfilled/,
      "起きたことを後から無かったことにしない",
    );
  }

  function testDuplicateIntentIsRejected() {
    const p = ledger("dup-intent");
    appendPaperTradeRecord(intent(), p);
    assert.throws(() => appendPaperTradeRecord(intent(), p), /duplicate paper trade intent/);
  }

  function testAppendOnly() {
    const p = ledger("append-only");
    appendPaperTradeRecord(intent(), p);
    const before = readFileSync(p, "utf-8");
    appendPaperTradeRecord(fill(), p);
    assert.ok(readFileSync(p, "utf-8").startsWith(before));
  }

  function testMalformedLedgerFailsClosed() {
    const p = ledger("malformed");
    appendPaperTradeRecord(intent(), p);
    appendFileSync(p, '{"schemaVersion":1,"kind":"nope","intentId":"x","recordedAt":"2026-09-11T09:00:00+09:00"}\n');
    assert.throws(() => readPaperTradeLedger(p), /unknown paper trade record kind/);
  }

  function testInvalidIntentFailsClosed() {
    const p = ledger("invalid");
    for (const [over, pattern] of [
      [{ code: "81" }, /4-5 alphanumeric/],
      [{ side: "flat" as never }, /side must be long or short/],
      [{ plannedEntryPrice: 0 }, /plannedEntryPrice must be a positive/],
      [{ plannedShares: 0 }, /plannedShares must be a positive/],
      [{ validUntil: "2026/09/12" }, /validUntil must be YYYY-MM-DD/],
      [{ stopPrice: 1100 }, /stopPrice must be on the losing side/],
    ] as const) {
      assert.throws(
        () => appendPaperTradeRecord(intent(over as Partial<PaperTradeIntent>), p),
        pattern,
      );
    }
  }

  testSlippageIsMeasuredAgainstThePlan();
  testUnfilledIsCountedNotIgnored();
  testClosedTradeNetsOutFees();
  testOpenTradesAreNotCountedInPerformance();
  testPartialFillIsSurfaced();
  testShortSideSlippageAndReturn();
  testUnknownIntentIsRejected();
  testDoubleFillAndDoubleExitAreRejected();
  testExitWithoutFillIsRejected();
  testFilledCannotBecomeUnfilled();
  testDuplicateIntentIsRejected();
  testAppendOnly();
  testMalformedLedgerFailsClosed();
  testInvalidIntentFailsClosed();

  console.log("paper-trade-ledger: 全テスト成功");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
