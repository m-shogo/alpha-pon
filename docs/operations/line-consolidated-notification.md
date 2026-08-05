# LINE統合通知 運用メモ

Status: `ACTIVE`
Updated: 2026-08-05 JST

朝の通常通知を1通に統合し、緊急だけを即時送信するための仕組みと運用手順。
配信状態は永続キュー（ledger）で管理し、実LINE送信に成功した内容だけを delivered として扱う。

## 責務モデル

| 種別 | 送信経路 | 実装 |
| --- | --- | --- |
| 通常（銘柄スコア・特殊状況・テーマニュース・リマインド・パイプライン注意） | pendingキューへ蓄積し、最後に**1通**へ統合 | 各ステップ → `enqueueFragment`（`LINE_BATCH_DIR`）→ `src/send-consolidated-line.ts` が統合送信 |
| 緊急①（`ScoreResult.alertLevel === "urgent"`） | **即時送信** | `src/notify.ts` `sendUrgentNotifications` |
| 緊急②（TDnet重要開示 `emergency-disclosure-watch`） | **即時送信（P0経路）** | `src/notify.ts` `sendUrgentDisclosure` |
| macOS通知 | 補助（音・ローカル表示のみ）。LINE送信とは独立 | `src/notify.ts` `notifyMacOS` / `notifyMacOSText` |

- 緊急は朝刊バッチへ回さず即時送信する。統合メッセージ側は本文を再掲せず
  「🚨 緊急 N 件は即時通知済み」と1行だけ参照する（二重送信防止）。
  N は **その日に実送信成功した緊急件数**（ledger の `kind=urgent, status=sent, deliveredAt=当日`）から算出する。
- 同一論理項目が複数ソース（pipeline summary / stock summary 等）から来ても、
  正規化キーで重複排除し1回だけ掲載する。**採用する代表は content hash 最小で決定論的**に選ぶ。
- 0件の日は空通知を送らない。

## 配信状態（ledger）

`LINE_BATCH_DIR/.ledger.json` が正本。fragment は `contentHash.txt` で保存（content-addressed / atomic write）。

| status | 意味 |
| --- | --- |
| `queued` | enqueue済み・未送信（**delivered ではない**） |
| `sent` | 実LINE送信成功。ファイルは削除、当日dedupeへ記録 |
| `pending-retry` | 送信失敗。`attempts < MAX_ATTEMPTS(5)`。次回再送候補 |
| `failed` | 失敗が上限到達。再送候補から外す（無限蓄積しない） |
| `skipped` | 論理重複として不採用（代表が送信済みのときのみ） |

- **enqueue しただけでは delivered/dedupe 記録をしない**。`recordTextNotification` は実送信成功時のみ。
- 文字数上限で省略/丸ごと落ちた fragment は delivered にせず `queued` のまま残す（次回統合で再送）。
- 単一 fragment が上限超過で切り詰められた場合のみ、その fragment は delivered 扱い（無限再送回避）＋本文に「続きはWebで確認」を明記。

## 再送保証（pendingの永続化）

- `LINE_BATCH_DIR` は**安定ディレクトリ** `tmp/line-batch-pending`（日付別にしない）。
  `run-daily-complete.sh` は開始時に**削除しない**（旧 `rm -rf` は撤去）。
- crash途中 / HTTP失敗 / network失敗 / 同日再実行 / 翌日再実行 でも pending fragment を失わない。
- 実送信成功した fragment だけを統合CLIが削除する。成功済みは再送しない（`ensureEntry` が `already-delivered` を返す）。
- 一時ファイル書き込みは temp + rename で atomic。

## 環境変数

| 変数 | 意味 |
| --- | --- |
| `LINE_BATCH_DIR` | 設定時、各ステップは即時送信せず pending キューへ蓄積 |
| `LINE_CHANNEL_TOKEN` / `LINE_USER_ID` | LINE Messaging API 資格情報。**未設定なら `credentials-missing`（実送信しない）** |
| `LINE_DRY_RUN=1` / `NOTIFY_MODE=off` | 実送信しない（本文を標準出力に出すのみ） |

送信結果は `sent` / `dry-run` / `credentials-missing` / `http-4xx` / `http-5xx` / `network-error` を区別する（`TransportResult`）。

## ドライラン手順（実送信なしの検証）

```bash
export LINE_BATCH_DIR="$PWD/tmp/line-batch-manual"
mkdir -p "$LINE_BATCH_DIR"
# enqueue（各ステップ相当）は enqueueFragment 経由が正。手動確認だけなら content-addressed に置く。
LINE_DRY_RUN=1 node --import tsx/esm src/send-consolidated-line.ts
```

- ドライラン時は何も delivered にせず、ファイルも削除しない（`queued` のまま）。

## 失敗時の挙動

- LINE送信失敗は **daily pipeline を止めない**。
  - `send-consolidated-line.ts` は失敗時も `exit 0` で、構造化結果 `line:consolidated result {...}` を出力。
  - `run-daily-complete.sh` 側でも `run_optional_step` で二重に非致命化。
- 失敗 fragment は `pending-retry` として残し、`attempts` と（伏字化した）`lastError` を記録。次回再送。
- **秘匿値の非出力**: token / userId はログ・エラー・結果JSON・ledger に出さない（`redactSecrets`）。

## テスト

```bash
node --import tsx/esm tests/line-consolidation.test.ts   # もしくは pnpm test
```

必須テスト1〜21（enqueue≠delivered / 成功時のみ記録 / HTTP・network失敗後のpending保持 /
同日・翌日再実行 / 成功後の重複送信防止 / urgent成功時のみカウント / dry-run・creds不足・4xx・5xxで
カウントしない / emergency-disclosureの即時経路 / 入力順非依存 / omitted非delivered / 省略件数の正確さ /
秘匿値リダクション / LINE失敗でpipeline非致命 / 実LINE未接続）を網羅。実ネットワークには接続しない。
