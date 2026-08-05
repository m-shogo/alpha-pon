# LINE統合通知 運用メモ

Status: `ACTIVE`
Updated: 2026-08-05 JST

朝の通常通知を1通に統合し、緊急だけを即時送信するための仕組みと運用手順。

## 責務モデル

| 種別 | 送信経路 | 実装 |
| --- | --- | --- |
| 通常（銘柄スコア・特殊状況・テーマニュース・リマインド・パイプライン注意） | バッチに蓄積し、最後に**1通**へ統合 | 各ステップ → `LINE_BATCH_DIR` にテキスト断片を書き出し → `src/send-consolidated-line.ts` が統合送信 |
| 緊急（`alertLevel === "urgent"`） | **即時送信**（バッチに畳まない） | `src/notify.ts` `sendUrgentNotifications` |
| macOS通知 | 補助（音・ローカル表示のみ）。LINE送信とは独立 | `src/notify.ts` `notifyMacOS` |

- 緊急を即時送信した件数は `LINE_BATCH_DIR/immediate-urgent.count` に累積し、統合メッセージ側は本文を再掲せず「🚨 緊急 N 件は即時通知済み」と1行だけ参照する（二重送信防止）。
- 同一論理項目が複数ソース（pipeline summary / stock summary 等）から来ても、正規化キーで重複排除し1回だけ掲載する。
- 0件の日は空通知を送らない（`buildConsolidatedMessage` が `null` を返す）。

## 環境変数

| 変数 | 意味 |
| --- | --- |
| `LINE_BATCH_DIR` | 設定時、各ステップは即時送信せずここへ蓄積する。`run-daily-complete.sh` が `tmp/line-batch-YYYY-MM-DD` を設定 |
| `LINE_CHANNEL_TOKEN` / `LINE_USER_ID` | LINE Messaging API 資格情報。**未設定なら自動的にドライラン**（実送信しない） |
| `LINE_DRY_RUN=1` | 資格情報があっても実送信しない（本文を標準出力に出すのみ） |
| `NOTIFY_MODE=off` | 同上（CI/開発の既定） |

## ドライラン手順（実送信なしの検証）

```bash
# 任意のバッチdirにサンプル断片を置く
export LINE_BATCH_DIR="$PWD/tmp/line-batch-manual"
mkdir -p "$LINE_BATCH_DIR"
printf '🌅 Alpha Pon Morning Lite\n1. 📌 7203 トヨタ 62点' > "$LINE_BATCH_DIR/000.txt"

# 実送信せず統合結果だけ確認
LINE_DRY_RUN=1 node --import tsx/esm src/send-consolidated-line.ts
```

- ドライラン時はバッチdirを削除しない（内容を確認・再実行できる）。
- 送信成功時のみバッチdirを削除する（再実行での二重送信を防ぐ / idempotency）。

## 失敗時の挙動

- LINE送信失敗は **daily pipeline を止めない**。
  - `send-consolidated-line.ts` は失敗時も `exit 0` で、構造化結果 `line:consolidated result {...}` を出力する。
  - さらに `run-daily-complete.sh` 側でも `run_optional_step` で包んでいる（二重の非致命化）。
- 失敗時はバッチdirを残すため、原因調査と次回再送が可能。
- **秘匿値の非出力**: トークン / userId はログ・エラー・結果JSONに出さない（`redactSecrets` で伏字化）。

## テスト

```bash
node --import tsx/esm tests/line-consolidation.test.ts
# もしくは pnpm test（統合テストに含まれる）
```

0件 / 1件 / 多数 / 文字数上限 / セクション上限 / 緊急のみ / 通常のみ / 混在 /
重複排除 / 順序決定性 / 入力順非依存 / ドライラン / モックtransport / 資格情報なし /
全失敗 / 部分失敗 / 秘匿値リダクション を網羅している。実ネットワークには接続しない。
