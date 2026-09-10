#!/bin/bash
# CI用: 外部通知を止め、モックデータで run-daily.sh 全体を軽く実行する
# 目的: daily単体ではなく、lock / pipeline_status / レポート導線まで壊れていないか確認する

# set -e が無いと、途中のコマンドが失敗しても素通りして exit 0 になる。
# 2026-09-10 の監査で、ここに並んでいる verify 15本が実質強制されていないこと
# （verify-market-event-source-observation-chronology が中で落ちていたのに smoke は成功扱い）
# が判明したため追加した。
# 注意: run-daily.sh / run-daily-complete.sh は「daily本体以外の失敗で全体を止めない」
# という設計方針のため意図的に set -e を持たない。ここは CI の検査なので止める。
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

rm -rf "$DIR/tmp/run-daily.lock"

USE_MOCK=true NOTIFY_MODE=off bash "$DIR/scripts/run-daily.sh"

test -f "$DIR/reports/pipeline_status_latest.json"
test -f "$DIR/reports/latest.md"
test -f "$DIR/reports/primary_disclosure_learning_latest.md"
test -f "$DIR/reports/primary_disclosure_category_learning_latest.md"
test -f "$DIR/reports/source_health_latest.md"
test -f "$DIR/reports/proposals_latest.md"

node <<'NODE'
const fs = require("fs");

const requiredReports = [
  "reports/latest.md",
  "reports/primary_disclosure_learning_latest.md",
  "reports/primary_disclosure_category_learning_latest.md",
  "reports/source_health_latest.md",
  "reports/proposals_latest.md",
  "reports/pipeline_status_latest.json",
];

for (const path of requiredReports) {
  if (!fs.existsSync(path)) {
    console.error(`missing required report: ${path}`);
    process.exit(1);
  }
}

const status = JSON.parse(fs.readFileSync("reports/pipeline_status_latest.json", "utf8"));
if (!status.status) {
  console.error("pipeline status is missing status");
  process.exit(1);
}
if (!["completed", "completed_with_warnings"].includes(status.status)) {
  console.error(`unexpected pipeline status: ${status.status}`);
  process.exit(1);
}
if (!Array.isArray(status.steps) || status.steps.length === 0) {
  console.error("pipeline status has no steps");
  process.exit(1);
}

const daily = status.steps.find((step) => step.name === "daily");
if (!daily) {
  console.error("daily step not found in pipeline status");
  process.exit(1);
}
if (daily.status !== "ok") {
  console.error(`daily step is not ok: ${daily.status}`);
  process.exit(1);
}

const criticalFailures = status.steps.filter((step) => step.criticality === "critical" && step.status !== "ok");
if (criticalFailures.length > 0) {
  console.error(`critical step failures: ${criticalFailures.map((step) => `${step.name}:${step.status}`).join(", ")}`);
  process.exit(1);
}

const expectedSteps = ["scan:world", "daily", "review:analogies:write", "learn", "learn:primary", "health:sources", "diagnose:rules", "proposals", "memory:companies", "maintain:data:write"];
const names = new Set(status.steps.map((step) => step.name));
for (const name of expectedSteps) {
  if (!names.has(name)) {
    console.error(`expected step missing: ${name}`);
    process.exit(1);
  }
}

const proposals = fs.readFileSync("reports/proposals_latest.md", "utf8");
if (!proposals.includes("# alpha-pon 改善提案レポート")) {
  console.error("proposals report title is missing");
  process.exit(1);
}

console.log(`pipeline smoke status=${status.status} steps=${status.steps.length} daily=${daily.status}`);
NODE

# TDnet / Market Event Phase 5 verification scripts contain runtime assertions that
# typechecking alone cannot exercise. Keep them offline and read-only in the full CI smoke gate.
node --import tsx/esm scripts/verify-tdnet-public-viewer.ts
node --import tsx/esm scripts/verify-tdnet-source-collector-current-viewer.ts
node --import tsx/esm scripts/verify-tdnet-candidate-collection.ts
node --import tsx/esm scripts/verify-tdnet-market-event-candidates.ts
node --import tsx/esm scripts/verify-tdnet-candidate-preview.ts
node --import tsx/esm scripts/verify-tdnet-primary-document-evidence.ts
node --import tsx/esm scripts/verify-tdnet-primary-document-eof-tail.ts
node --import tsx/esm scripts/verify-tdnet-primary-review.ts
node --import tsx/esm scripts/verify-tdnet-primary-review-hash-provenance.ts
node --import tsx/esm scripts/verify-tdnet-future-date-window-validation.ts
node --import tsx/esm scripts/verify-tdnet-registration-preview.ts
node --import tsx/esm scripts/verify-tdnet-registration-preview-staleness.ts
node --import tsx/esm scripts/verify-market-event-source-observation-chronology.ts
node --import tsx/esm scripts/verify-market-event-ledger-read-boundary.ts
node --import tsx/esm scripts/verify-source-checkpoint-read-validation.ts

# market-event コアの検査。2026-09-10 の監査まで、これらはどのチェーンからも
# 起動されていなかった（set -e が無かったため、仮に並べても強制されていなかった）。
node --import tsx/esm scripts/verify-market-event-schema.ts
node --import tsx/esm scripts/verify-market-event-foundation.ts
node --import tsx/esm scripts/verify-market-event-ledger-replay.ts
node --import tsx/esm scripts/verify-market-event-revision-guards.ts
node --import tsx/esm scripts/verify-market-event-decision-replay.ts
node --import tsx/esm scripts/verify-market-event-delivery-replay.ts
node --import tsx/esm scripts/verify-market-event-delivery-key-provenance.ts
node --import tsx/esm scripts/verify-market-event-timezone-validation.ts
node --import tsx/esm scripts/verify-market-event-end-to-end.ts
node --import tsx/esm scripts/verify-market-event-event-type-identity.ts
node --import tsx/esm scripts/verify-market-event-audit-source-provenance.ts
node --import tsx/esm scripts/verify-market-event-audit-delivery-semantics.ts
node --import tsx/esm scripts/verify-market-event-audit-revision-chronology.ts
node --import tsx/esm scripts/verify-market-event-source-replay.ts
node --import tsx/esm scripts/verify-market-event-source-url-provenance.ts
node --import tsx/esm scripts/verify-market-event-occurrence-key-provenance.ts
node --import tsx/esm scripts/verify-market-event-issuer-code-provenance.ts
node --import tsx/esm scripts/verify-market-event-projection-time-validation.ts
node --import tsx/esm scripts/verify-market-event-projection-metadata-instants.ts
node --import tsx/esm scripts/verify-source-checkpoint-failure-replay.ts
node --import tsx/esm scripts/verify-d1-bootstrap-export.ts

# Edge 検証チェーン（検出 → Holdout除外 → 対照群 → イベントスタディ）を
# 合成 fixture で通す。個々のモジュールが揃っていても繋ぐ層で壊れるため。
pnpm research:edge-study:fixtures

# 価格の一括取り込み CLI を dry-run で通す。
# 既定でネットワークを触らないので CI で安全に回せる。取り込み計画と
# 「取り込み済み判定」が壊れると、再開時に全部取り直すか全部飛ばすかの
# どちらかになり、どちらも静かに壊れる。
pnpm ingest:prices -- --from 2025-09-01 --to 2025-09-05 > /dev/null

# 取り込んだ価格ストアの健全性。F1・イベントスタディ・backtest の土台なので、
# 静かに壊れると先の測定が「動いているが間違っている」状態になる。
# 価格が1日も無い環境（CI）では検査対象なしで正常終了する。
node --import tsx/esm scripts/verify-price-store-integrity.ts > /dev/null

# TDnet 開示保存庫の欠落。公開ビューアは約1ヶ月しか遡れないので、
# 欠落に気づくのが遅れると永久に埋められない。
# 保存庫が空の環境（CI）では検査対象なしで正常終了する。
node --import tsx/esm scripts/verify-disclosure-archive-gaps.ts > /dev/null

# テストファイル内で「定義したが呼んでいない」テスト関数を防ぐ。
# ファイル単位の未実行は run-all-tests.ts の glob で塞いだが、
# 1ファイルの中で定義だけして呼ばない関数は拾えない。
node --import tsx/esm scripts/verify-test-function-reachability.ts > /dev/null

# verify script が「追記し忘れ」でどこからも起動されない状態を防ぐ。
node --import tsx/esm scripts/verify-script-reachability.ts

# tests/ 配下を漏れなく実行する。
# 2026-09-10 の監査で 475本中139本がどのチェーンからも実行されておらず、
# うち14本が誰にも気づかれずに失敗していた。チェーンへの追記忘れという
# 失敗様式そのものを無くすため、glob で全部拾う。
node --import tsx/esm scripts/run-all-tests.ts
