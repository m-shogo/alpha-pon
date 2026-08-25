#!/usr/bin/env bash
set -euo pipefail

pnpm typecheck
pnpm typecheck:tests
pnpm typecheck:scripts

node --import tsx/esm tests/score.test.ts
node --import tsx/esm tests/validation.test.ts
node --import tsx/esm tests/analysis.test.ts
node --import tsx/esm tests/expert-ensemble.test.ts
node --import tsx/esm tests/stock-decision.test.ts
node --import tsx/esm tests/price-signal.test.ts
node --import tsx/esm tests/safe-wording.test.ts
node --import tsx/esm tests/pro-disagreement.test.ts
node --import tsx/esm tests/pro-generated-data-shape.test.ts
node --import tsx/esm tests/source-health-coverage-shape.test.ts
node --import tsx/esm tests/source-health-report-file.test.ts
node --import tsx/esm tests/source-health-score-file.test.ts
node --import tsx/esm tests/ops-dashboard-pipeline-input.test.ts
node --import tsx/esm tests/ops-dashboard-special-input.test.ts
node --import tsx/esm tests/ops-dashboard-integrity-input.test.ts
node --import tsx/esm tests/ops-dashboard-outcome-quality-input.test.ts
node --import tsx/esm tests/ops-dashboard-outcomes-input.test.ts
node --import tsx/esm tests/ops-dashboard-safe-output-health.test.ts
node --import tsx/esm tests/yearly-knowledge-review-input.test.ts
node --import tsx/esm tests/health-success-artifact.test.ts
node --import tsx/esm tests/pro-knowledge-refresh-input.test.ts
node --import tsx/esm tests/periodic-review-score-input.test.ts
node --import tsx/esm tests/company-hypothesis-report-input.test.ts
node --import tsx/esm tests/pipeline-health-input.test.ts
node --import tsx/esm tests/proposals-pipeline-input.test.ts
node --import tsx/esm tests/read-only-json-file-boundary.test.ts
node --import tsx/esm tests/read-only-jsonl-file-boundary.test.ts
node --import tsx/esm tests/line-consolidation.test.ts

echo "draft-checks: ok"
