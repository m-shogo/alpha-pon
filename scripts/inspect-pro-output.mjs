#!/usr/bin/env node
// Pro委員会出力インスペクタ
// 使い方: node scripts/inspect-pro-output.mjs
// または: pnpm inspect:pro
//
// 買い推奨ではありません。調査・検証・反証・学習用。

import { existsSync, readFileSync } from "fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function count(arr, pred) {
  return arr.filter(pred).length;
}

function distribution(arr, key) {
  const map = {};
  for (const item of arr) {
    const val = String(item[key] ?? "(未設定)");
    map[val] = (map[val] ?? 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

// ---- reports/stock_pro_committee_latest.json ----

const committeeJson = readJson(`${ROOT}/reports/stock_pro_committee_latest.json`);

if (!committeeJson) {
  console.error("reports/stock_pro_committee_latest.json が見つかりません。pnpm pro:committee を先に実行してください。");
  process.exit(1);
}

const { decisions, generatedAt } = committeeJson;

console.log("=== Pro委員会 インスペクト ===");
console.log(`生成日時: ${generatedAt}`);
console.log(`銘柄数: ${decisions.length}`);
console.log("");

// finalLabel 分布
console.log("--- finalLabel 分布 ---");
for (const [label, n] of distribution(decisions, "finalLabel")) {
  const bar = "█".repeat(n);
  console.log(`  ${label.padEnd(10)} ${bar} (${n}件)`);
}
console.log("");

// originalFinalLabel 分布
console.log("--- originalFinalLabel 分布 ---");
for (const [label, n] of distribution(decisions, "originalFinalLabel")) {
  const bar = "█".repeat(n);
  console.log(`  ${label.padEnd(10)} ${bar} (${n}件)`);
}
console.log("");

// agreementLevel (consensus) 分布
console.log("--- agreementLevel (consensus) 分布 ---");
for (const [level, n] of distribution(decisions, "consensus")) {
  const bar = "█".repeat(n);
  console.log(`  ${level.padEnd(14)} ${bar} (${n}件)`);
}
console.log("");

// disagreements 件数
const withDisagreements = decisions.filter(d => d.disagreements && d.disagreements.length > 0);
console.log(`--- disagreements ---`);
console.log(`  disagreements あり: ${withDisagreements.length} 件`);
for (const d of withDisagreements) {
  for (const dis of d.disagreements) {
    console.log(`    [${d.code} ${d.name}] ${dis.topic}`);
    console.log(`      ${dis.description}`);
  }
}
console.log("");

// 安全ルールでラベルが変更された銘柄
const safetyApplied = decisions.filter(d => d.finalLabel !== d.originalFinalLabel);
console.log(`--- 安全ルールでラベル変更された銘柄 ---`);
console.log(`  変更件数: ${safetyApplied.length} 件`);
for (const d of safetyApplied) {
  console.log(`  ${d.code} ${d.name}: ${d.originalFinalLabel} → ${d.finalLabel}`);
}
console.log("");

// blockingAgents / cautiousAgents
const blockingEntries = decisions.flatMap(d =>
  (d.verdicts ?? []).filter(v => v.isBlock).map(v => `${d.code}[${v.agentId}]`)
);
const cautiousEntries = decisions.flatMap(d =>
  (d.verdicts ?? []).filter(v => v.isCautious).map(v => `${d.code}[${v.agentId}]`)
);
console.log(`--- blockingAgents / cautiousAgents ---`);
console.log(`  blockingAgents: ${blockingEntries.length > 0 ? blockingEntries.join(", ") : "なし"}`);
console.log(`  cautiousAgents (件数): ${cautiousEntries.length} 件`);
console.log("");

// disagreement topics 一覧
const topics = decisions.flatMap(d => (d.disagreements ?? []).map(dis => dis.topic));
const topicCounts = {};
for (const t of topics) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
console.log(`--- disagreement topics ---`);
if (Object.keys(topicCounts).length === 0) {
  console.log("  (食い違いなし)");
} else {
  for (const [t, n] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${n} 件`);
  }
}
console.log("");

// legend Pro委員会 decisions 件数
const dataJson = readJson(`${ROOT}/apps/web/public/generated/alpha-pon-data.json`);
if (dataJson) {
  const lpc = dataJson.legendProCommittee;
  if (lpc) {
    console.log(`--- legendProCommittee ---`);
    console.log(`  decisions 件数: ${lpc.decisions?.length ?? 0}`);
    const uiDecisions = decisions.length;
    const lpcDecisions = lpc.decisions?.length ?? 0;
    if (uiDecisions !== lpcDecisions) {
      console.warn(`  ⚠ committee (${uiDecisions}件) と UI (${lpcDecisions}件) で件数が異なります`);
    } else {
      console.log(`  ✓ committee と UI decisions 件数が一致: ${uiDecisions}件`);
    }
  } else {
    console.log("legendProCommittee が null (pnpm pro:committee && pnpm ui:data を実行してください)");
  }
} else {
  console.log("alpha-pon-data.json が見つかりません (pnpm ui:data を実行してください)");
}
console.log("");

// 判定が厳しすぎないかチェック
const avoidCount = count(decisions, d => d.finalLabel === "避ける");
const evidenceGapCount = count(decisions, d => d.finalLabel === "証拠不足");
const conflictCount = count(decisions, d => d.consensus === "conflict");
const total = decisions.length;
console.log(`--- 判定バランス確認 ---`);
if (total > 0) {
  const avoidRate = (avoidCount / total * 100).toFixed(0);
  const gapRate = (evidenceGapCount / total * 100).toFixed(0);
  const conflictRate = (conflictCount / total * 100).toFixed(0);
  console.log(`  避ける: ${avoidCount}件 (${avoidRate}%)`);
  console.log(`  証拠不足: ${evidenceGapCount}件 (${gapRate}%)`);
  console.log(`  conflict: ${conflictCount}件 (${conflictRate}%)`);
  if (avoidCount / total > 0.5) {
    console.warn("  ⚠ 避けるが50%超。isBlock条件 (stance==='避ける'のみ) を確認してください");
  }
  if (evidenceGapCount / total > 0.9) {
    console.warn("  ⚠ 証拠不足が90%超。一次情報 (IR/network/hypotheses) の登録が必要です");
  }
}
console.log("");
console.log("=== インスペクト完了 ===");
