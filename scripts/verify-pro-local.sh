#!/bin/bash
# Pro委員会 ローカル検証スクリプト
# 使い方: bash scripts/verify-pro-local.sh
# または: pnpm verify:pro:local
#
# 買い推奨ではありません。調査・検証・反証・学習用。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo ""
echo "=== [verify-pro-local] 開始 ==="
echo "対象リポジトリ: $(node -e "console.log(require('./package.json').name)")"
echo ""

# リポジトリ確認
REPO_NAME="$(node -e "console.log(require('./package.json').name)")"
if [ "$REPO_NAME" != "alpha-pon" ]; then
  echo "ERROR: package.json name が alpha-pon ではありません: $REPO_NAME"
  exit 1
fi

# Step 1: Pro委員会レポート生成
echo "--- Step 1: pnpm pro:committee ---"
pnpm pro:committee
echo ""

# Step 2: UI データ生成
echo "--- Step 2: pnpm ui:data ---"
pnpm ui:data
echo ""

# Step 3: 食い違い検出テスト
echo "--- Step 3: pro-disagreement.test.ts ---"
node --import tsx/esm tests/pro-disagreement.test.ts
echo ""

# Step 4: 生成データ形状テスト
echo "--- Step 4: pro-generated-data-shape.test.ts ---"
node --import tsx/esm tests/pro-generated-data-shape.test.ts
echo ""

# Step 5: インスペクト出力
echo "--- Step 5: inspect-pro-output ---"
node scripts/inspect-pro-output.mjs
echo ""

echo "=== [verify-pro-local] 完了 ==="
