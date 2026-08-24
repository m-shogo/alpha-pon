import assert from "node:assert/strict";
import { parseCatchupDays } from "../src/jobs/catchup-config.js";

assert.equal(parseCatchupDays(undefined), 7, "未指定は既定7日");
assert.equal(parseCatchupDays("7"), 7, "正の整数を保持する");
assert.equal(parseCatchupDays("90"), 90, "上限90日を許可する");
assert.equal(parseCatchupDays("91"), 90, "90日を超える値は上限へ丸める");
assert.equal(parseCatchupDays("0"), 7, "0日は既定値へfail-closedする");
assert.equal(parseCatchupDays("-3"), 7, "負数は既定値へfail-closedする");
assert.equal(parseCatchupDays("abc"), 7, "非numeric値は既定値へfail-closedする");
assert.equal(parseCatchupDays("7days"), 7, "部分parseできる文字列をrejectする");
assert.equal(parseCatchupDays("1.5"), 7, "小数をrejectする");

console.log("catchup-config.test.ts passed");
