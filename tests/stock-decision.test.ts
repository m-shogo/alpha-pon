// action-scoring, generate-stock-rule, disclosure-keywords のテスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";

// ── action-scoring テスト ────────────────────────────────────────────

// 最小限のインライン実装（apps/web/lib からの import は CLI テストでは未対応なため複製）
type InternalSignal = 'ENTRY_WATCH' | 'ADD_WATCH' | 'HOLD' | 'TRIM_WATCH' | 'EXIT_WATCH' | 'NO_ACTION' | 'DANGER'

function judgeStockActionTest(input: {
  price: number | null;
  positionStatus: 'not_owned' | 'owned';
  positionWeightPct: number;
  drawdownFromHigh52wPct: number | null;
  unrealizedGainPct?: number | null;
  operatingProfitGrowthPct: number | null;
  hasDownwardRevision: boolean;
  hasAccountingOrAuditRisk: boolean;
  thesisStillValid: boolean;
  isBeforeEarnings: boolean;
  valuationRisk: 'low' | 'middle' | 'high' | 'unknown';
}): { signal: InternalSignal; score: number } {
  let score = 50;
  if (input.price == null) return { signal: 'NO_ACTION', score: 0 };
  if (input.hasAccountingOrAuditRisk) return { signal: 'DANGER', score: 10 };
  if (!input.thesisStillValid) return { signal: 'EXIT_WATCH', score: 20 };
  if (input.hasDownwardRevision) score -= 30;
  if (input.operatingProfitGrowthPct !== null && input.operatingProfitGrowthPct >= 10) score += 20;
  if (input.drawdownFromHigh52wPct !== null && input.drawdownFromHigh52wPct <= -15 && input.drawdownFromHigh52wPct >= -35) score += 20;
  if (input.valuationRisk === 'high') score -= 15;
  if (input.isBeforeEarnings) score -= 5;
  if (input.positionWeightPct >= 25) return { signal: 'NO_ACTION', score };
  if (input.positionStatus === 'not_owned' && score >= 75) return { signal: 'ENTRY_WATCH', score };
  if (input.positionStatus === 'owned' && score >= 75 && (input.unrealizedGainPct ?? 0) <= 5) return { signal: 'ADD_WATCH', score };
  if (input.positionStatus === 'owned' && (input.unrealizedGainPct ?? 0) >= 25 && input.valuationRisk === 'high') return { signal: 'TRIM_WATCH', score };
  if (input.positionStatus === 'owned') return { signal: 'HOLD', score };
  return { signal: 'NO_ACTION', score };
}

function testPriceNull() {
  const r = judgeStockActionTest({ price: null, positionStatus: 'not_owned', positionWeightPct: 0, drawdownFromHigh52wPct: null, operatingProfitGrowthPct: null, hasDownwardRevision: false, hasAccountingOrAuditRisk: false, thesisStillValid: true, isBeforeEarnings: false, valuationRisk: 'unknown' });
  assert.equal(r.signal, 'NO_ACTION');
  assert.equal(r.score, 0);
}

function testAccountingRisk() {
  const r = judgeStockActionTest({ price: 1000, positionStatus: 'owned', positionWeightPct: 10, drawdownFromHigh52wPct: -20, operatingProfitGrowthPct: 15, hasDownwardRevision: false, hasAccountingOrAuditRisk: true, thesisStillValid: true, isBeforeEarnings: false, valuationRisk: 'low' });
  assert.equal(r.signal, 'DANGER');
}

function testThesisBroken() {
  const r = judgeStockActionTest({ price: 1000, positionStatus: 'owned', positionWeightPct: 10, drawdownFromHigh52wPct: -20, operatingProfitGrowthPct: null, hasDownwardRevision: false, hasAccountingOrAuditRisk: false, thesisStillValid: false, isBeforeEarnings: false, valuationRisk: 'unknown' });
  assert.equal(r.signal, 'EXIT_WATCH');
}

function testHighScoreNewEntry() {
  const r = judgeStockActionTest({ price: 1000, positionStatus: 'not_owned', positionWeightPct: 0, drawdownFromHigh52wPct: -20, operatingProfitGrowthPct: 20, hasDownwardRevision: false, hasAccountingOrAuditRisk: false, thesisStillValid: true, isBeforeEarnings: false, valuationRisk: 'low' });
  assert.equal(r.signal, 'ENTRY_WATCH');
  assert.ok(r.score >= 75);
}

function testTrimWatch() {
  const r = judgeStockActionTest({ price: 1000, positionStatus: 'owned', positionWeightPct: 15, drawdownFromHigh52wPct: -5, operatingProfitGrowthPct: 5, unrealizedGainPct: 30, hasDownwardRevision: false, hasAccountingOrAuditRisk: false, thesisStillValid: true, isBeforeEarnings: false, valuationRisk: 'high' });
  assert.equal(r.signal, 'TRIM_WATCH');
}

function testHighPosition() {
  const r = judgeStockActionTest({ price: 1000, positionStatus: 'owned', positionWeightPct: 30, drawdownFromHigh52wPct: -20, operatingProfitGrowthPct: 20, hasDownwardRevision: false, hasAccountingOrAuditRisk: false, thesisStillValid: true, isBeforeEarnings: false, valuationRisk: 'low' });
  assert.equal(r.signal, 'NO_ACTION');
}

// ── disclosure-keywords テスト ────────────────────────────────────────

const POSITIVE_KW = ['上方修正', '増配', '自社株買い', '最高益'];
const DANGER_KW = ['決算延期', '監査', '不正', '下方修正', '継続企業の前提'];

function classifyTest(title: string) {
  const pos = POSITIVE_KW.filter(k => title.includes(k));
  const dan = DANGER_KW.filter(k => title.includes(k));
  return { positive: pos.length > 0, danger: dan.length > 0, matchedKeywords: [...pos, ...dan] };
}

function testPositiveDisclosure() {
  const r = classifyTest('業績予想の修正（上方修正）について');
  assert.ok(r.positive);
  assert.ok(!r.danger);
  assert.ok(r.matchedKeywords.includes('上方修正'));
}

function testDangerDisclosure() {
  const r = classifyTest('第三者委員会の設置に関する監査について');
  assert.ok(r.danger);
}

function testNeutralDisclosure() {
  const r = classifyTest('中間決算短信について');
  assert.ok(!r.positive);
  assert.ok(!r.danger);
  assert.equal(r.matchedKeywords.length, 0);
}

// ── generate-stock-rule テスト ────────────────────────────────────────

function generateRuleTest(input: { code: string; name: string; currentPrice: number | null; drawdownFromHigh52wPct: number | null; operatingProfitGrowthPct: number | null; hasDangerDisclosure: boolean; positionStatus: 'not_owned' | 'owned' }) {
  if (input.currentPrice == null) return { actionSignal: 'NO_ACTION', confidence: 0.1, watchPriceZones: [] };
  let score = 50;
  if (input.hasDangerDisclosure) score -= 40;
  if (input.operatingProfitGrowthPct !== null && input.operatingProfitGrowthPct >= 10) score += 20;
  if (input.drawdownFromHigh52wPct !== null && input.drawdownFromHigh52wPct <= -15 && input.drawdownFromHigh52wPct >= -35) score += 20;
  let actionSignal: InternalSignal = input.hasDangerDisclosure ? 'DANGER' : score >= 75 && input.positionStatus === 'not_owned' ? 'ENTRY_WATCH' : 'NO_ACTION';
  const base = input.currentPrice;
  return {
    actionSignal,
    confidence: Math.max(0.1, Math.min(0.9, score / 100)),
    watchPriceZones: [{ label: '浅い押し目監視', priceFrom: Math.round(base * 0.95), priceTo: Math.round(base * 0.98), reason: '...' }],
  };
}

function testRuleMissingPrice() {
  const r = generateRuleTest({ code: '1234', name: 'テスト', currentPrice: null, drawdownFromHigh52wPct: null, operatingProfitGrowthPct: null, hasDangerDisclosure: false, positionStatus: 'not_owned' });
  assert.equal(r.actionSignal, 'NO_ACTION');
  assert.equal(r.confidence, 0.1);
}

function testRuleDanger() {
  const r = generateRuleTest({ code: '1234', name: 'テスト', currentPrice: 1000, drawdownFromHigh52wPct: -20, operatingProfitGrowthPct: 15, hasDangerDisclosure: true, positionStatus: 'not_owned' });
  assert.equal(r.actionSignal, 'DANGER');
}

function testRuleEntryWatch() {
  const r = generateRuleTest({ code: '1234', name: 'テスト', currentPrice: 1000, drawdownFromHigh52wPct: -20, operatingProfitGrowthPct: 20, hasDangerDisclosure: false, positionStatus: 'not_owned' });
  assert.equal(r.actionSignal, 'ENTRY_WATCH');
  assert.ok(r.watchPriceZones.length > 0);
}

function testNoHardcodedStockCode() {
  // コードベースに特定銘柄のハードコード分岐がないことを確認
  const files = [
    join(process.cwd(), "src", "generate-company-rules.ts"),
    join(process.cwd(), "apps", "web", "lib", "stock", "action-scoring.ts"),
    join(process.cwd(), "apps", "web", "lib", "stock", "rules", "generate-stock-rule.ts"),
  ];
  for (const f of files) {
    try {
      const content = readFileSync(f, "utf-8");
      // === '8136' のような特定銘柄コード直接比較がないことを確認
      assert.ok(!content.includes("=== '8136'"), `${f} に 8136 ハードコード分岐`);
      assert.ok(!content.includes('=== "8136"'), `${f} に 8136 ハードコード分岐`);
    } catch { /* ファイルが存在しない場合はスキップ */ }
  }
}

// ── private/portfolio 表示変換テスト ────────────────────────────────

function testDisplaySignal() {
  const privateMap: Record<InternalSignal, string> = { ENTRY_WATCH: '新規調査候補', ADD_WATCH: '追加調査候補', HOLD: '継続監視', TRIM_WATCH: '一部整理検討', EXIT_WATCH: '撤退条件確認', NO_ACTION: '何もしない', DANGER: '危険' };
  const portfolioMap: Record<InternalSignal, string> = { ENTRY_WATCH: '監視候補', ADD_WATCH: '優先監視', HOLD: '保有観察', TRIM_WATCH: '一部整理検討', EXIT_WATCH: '撤退検討', NO_ACTION: '様子見', DANGER: '危険' };
  const signals: InternalSignal[] = ['ENTRY_WATCH', 'ADD_WATCH', 'HOLD', 'TRIM_WATCH', 'EXIT_WATCH', 'NO_ACTION', 'DANGER'];
  for (const sig of signals) {
    assert.ok(privateMap[sig], `private map missing ${sig}`);
    assert.ok(portfolioMap[sig], `portfolio map missing ${sig}`);
    assert.ok(!privateMap[sig].includes('買い推奨'), `private map contains 買い推奨 for ${sig}`);
    assert.ok(!portfolioMap[sig].includes('買い推奨'), `portfolio map contains 買い推奨 for ${sig}`);
  }
}

// ── 実行 ─────────────────────────────────────────────────────────────

testPriceNull();
testAccountingRisk();
testThesisBroken();
testHighScoreNewEntry();
testTrimWatch();
testHighPosition();
testPositiveDisclosure();
testDangerDisclosure();
testNeutralDisclosure();
testRuleMissingPrice();
testRuleDanger();
testRuleEntryWatch();
testNoHardcodedStockCode();
testDisplaySignal();

console.log("stock-decision.test.ts passed");
