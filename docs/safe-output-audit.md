# 公開出力 安全表現監査（pnpm audit:safe-output）

公開ページ・レポートテンプレート・docs・CLI 出力に、買い推奨に見える危険表現が
混ざっていないかを監査する。alpha-pon は投資助言を行わないため、
「調査候補」「影響仮説」「確認シグナル」「未検証」「検証結果」等の安全表現に揃える。

## 方針

- **完全禁止ではなく audit**。検出は確認対象であり、文脈が安全なら許可リストで除外する
- 否定文（「〜ではない」「〜ではなく」）、禁止説明（「〜禁止」「〜と書かない」）、
  反面教師の文脈（wrongTakeaways 等）は false positive として除外する
- 検出語はマスク表示し、レポート自体に危険表現の原文を残さない
- 検査パターンはソース内で連結構築（`j()`）し、自己検出を回避する

## 対象と除外

- 対象: `src/`、`apps/web/app/`、`apps/web/lib/`、`docs/`（.ts / .tsx / .md）
- 除外: `node_modules`、`.next`、`generated`（生成 JSON は `pnpm report:ops` の安全表現チェックが担当）

## 実行

```bash
pnpm audit:safe-output
```

出力:

- `reports/safe-output-audit.json` — 機械可読（healthStatus / findings）
- `reports/safe-output-audit.md` — 人間が読む用（マスク済み）
- `/ops` の「公開出力 危険表現監査」行に反映（`pnpm report:ops` 実行時）

検出が 1 件でもあれば healthStatus は `needs_attention`、`/ops` に attention issue が出る。

## 既存の安全表現チェックとの関係

| 監査 | 対象 | タイミング |
|---|---|---|
| `tests/safe-wording.test.ts` | ソースコードの連続文字列 | `pnpm test` |
| `pnpm report:ops` の安全表現チェック | 生成物（generated JSON・latest レポート） | daily / check |
| `pnpm audit:safe-output` | ソース・UI・docs の公開テンプレート | 手動 / 任意のチェーン |

## 関連

- 実装: `src/safe-output-audit.ts`
- テスト: `tests/safe-output-audit.test.ts`
