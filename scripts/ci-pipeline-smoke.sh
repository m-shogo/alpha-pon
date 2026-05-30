#!/bin/bash
# CI用: 外部通知を止め、モックデータで run-daily.sh 全体を軽く実行する
# 目的: daily単体ではなく、lock / pipeline_status / レポート導線まで壊れていないか確認する

set -u

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
