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
node --import tsx/esm tests/ops-dashboard-pipeline-input.test.ts
node --import tsx/esm tests/line-consolidation.test.ts

echo "draft-checks: ok"
