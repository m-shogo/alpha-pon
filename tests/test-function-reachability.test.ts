// 「定義したが呼んでいないテスト関数」検査のテスト。
//
// 落とすためのチェックで誤検出を出すと、その日から誰も信じなくなる。
// 最初の実装は文字列除去がシングルクォート内の `"` を遠くの `"` と対にして
// 1ファイルから4,615文字を巻き込み、**19件の誤検出**を出した
// （実際は main() の中から呼ばれていた）。その形を固定する。

import assert from "node:assert/strict";
import { findUncalledTestFunctions } from "../src/test-function-reachability.js";

function find(source: string): string[] {
  return findUncalledTestFunctions({ file: "x.test.ts", source }).map((one) => one.name);
}

function testDetectsDefinedButNeverCalled(): void {
  const source = [
    "function testAlpha() { assert.ok(true); }",
    "function testBeta() { assert.ok(true); }",
    "testAlpha();",
  ].join("\n");
  assert.deepEqual(find(source), ["testBeta"]);
}

function testCallInsideMainIsReachable(): void {
  // 実際の tests/analysis.test.ts の形。インデントされた呼び出しを
  // 見落とすと19件の誤検出になる。
  const source = [
    "function testAlpha() { assert.ok(true); }",
    "function testBeta() { assert.ok(true); }",
    "function main() {",
    "  testAlpha();",
    "  testBeta();",
    "}",
    "main();",
  ].join("\n");
  assert.deepEqual(find(source), []);
}

function testStringsContainingQuotesDoNotHideCalls(): void {
  // 最初の実装が壊れた形。シングルクォート内の `"` が遠くの `"` と
  // 対になってファイルの一部を消し、呼び出しが見えなくなっていた。
  const source = [
    "const a = 'he said \"hi';",
    "function testAlpha() { assert.ok(true); }",
    "const b = 'and \" again';",
    "testAlpha();",
  ].join("\n");
  assert.deepEqual(find(source), [], "文字列の引用符で呼び出しを見失ってはいけない");
}

function testAwaitedCallCounts(): void {
  const source = [
    "async function testAlpha() { assert.ok(true); }",
    "await testAlpha();",
  ].join("\n");
  assert.deepEqual(find(source), []);
}

function testSimilarNameDoesNotCount(): void {
  // testAlpha の呼び出しが無いのに testAlphaBeta の呼び出しで満たされない。
  const source = [
    "function testAlpha() { assert.ok(true); }",
    "function testAlphaBeta() { assert.ok(true); }",
    "testAlphaBeta();",
  ].join("\n");
  assert.deepEqual(find(source), ["testAlpha"]);
}

function testArrowFormIsChecked(): void {
  const source = [
    "const testAlpha = () => { assert.ok(true); };",
    "const testBeta = async () => { assert.ok(true); };",
    "testAlpha();",
  ].join("\n");
  assert.deepEqual(find(source), ["testBeta"]);
}

function testNonTestFunctionsAreIgnored(): void {
  // ヘルパーは呼ばれていなくても検査対象外（test で始まる名前だけ見る）。
  const source = [
    "function helper() { return 1; }",
    "function testAlpha() { assert.ok(helper()); }",
    "testAlpha();",
  ].join("\n");
  assert.deepEqual(find(source), []);
}

function testCallFromAnotherTestFunctionCounts(): void {
  const source = [
    "function testShared() { assert.ok(true); }",
    "function testAlpha() { testShared(); }",
    "testAlpha();",
  ].join("\n");
  assert.deepEqual(find(source), []);
}

testDetectsDefinedButNeverCalled();
testCallInsideMainIsReachable();
testStringsContainingQuotesDoNotHideCalls();
testAwaitedCallCounts();
testSimilarNameDoesNotCount();
testArrowFormIsChecked();
testNonTestFunctionsAreIgnored();
testCallFromAnotherTestFunctionCounts();

console.log("test-function-reachability: 全テスト成功");
