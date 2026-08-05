# LINE統合通知 運用メモ

Status: `ACTIVE`
Updated: 2026-08-05 JST

朝の通常通知を1通に統合し、緊急だけを即時送信する仕組みと運用手順。
配信状態は永続 ledger（content-addressed）で管理し、**実LINE送信に成功した内容だけ** delivered として扱う。

## 責務モデル

| 種別 | 送信経路 | 実装 |
| --- | --- | --- |
| 通常（銘柄スコア・特殊状況・テーマニュース・リマインド・パイプライン注意） | pendingキューへ蓄積し、最後に**1通**へ統合 | 各ステップ → `enqueueFragment` → `src/send-consolidated-line.ts` が統合送信 |
| 緊急①（`ScoreResult.alertLevel === "urgent"`） | **即時送信**（送信前dedupe付き） | `sendUrgentNotifications` → `deliverUrgent` |
| 緊急②（TDnet重要開示 `emergency-disclosure-watch`） | **即時送信（P0経路・送信前dedupe付き）** | `sendUrgentDisclosure` → `deliverUrgent` |
| macOS通知 | 補助（音・ローカル表示のみ）。LINE送信とは独立 | `notifyMacOS` / `notifyMacOSText` |

- 緊急は朝刊バッチへ回さず即時送信。統合メッセージ側は本文を再掲せず「🚨 緊急 N 件は即時通知済み」と1行だけ参照する。
  N は **その日(JST)に実送信成功した緊急件数**（ledger `kind=urgent, status=sent, deliveredDateJst=当日`）。
- urgent は `deliverUrgent` に共通化し、**送信前に ledger を確認**：既に `sent` なら LINE を呼ばず `skipped-already-sent`、`pending-retry` なら同一 entry を再送、同一 content hash を重複 enqueue しない。プロセス再起動後も ledger で重複を防ぐ。
- 同一論理項目が複数ソースから来ても正規化キーで重複排除し、**代表は content hash 最小で決定論選択**（deterministic representative selection）。
- 0件の日は空通知を送らない。

## 配信状態（ledger）

`LINE_BATCH_DIR/.ledger.json` が正本。fragment は `contentHash.txt`（content-addressed / atomic write）。

| status | 意味 |
| --- | --- |
| `queued` | enqueue済み・未送信（**delivered ではない**） |
| `sent` | 実LINE送信成功。ファイル削除、`deliveredDateJst` 記録、当日dedupe記録 |
| `pending-retry` | 実送信失敗（http/network）で `attempts < MAX_ATTEMPTS(5)`。次回再送候補 |
| `failed` | attempts が上限到達。自動再送しない（無限蓄積しない） |
| `skipped` | 論理重複として不採用（代表が送信済みのときのみ） |

構造化された配信結果は `sent` / `skipped-already-sent` / `queued` / `dry-run` / `credentials-missing` / `http-4xx` / `http-5xx` / `network-error` / `failed-max-attempts` を区別する。

### retry budget（attempts）を消費する条件

- **消費する**: `http-4xx` / `http-5xx` / `network-error`（実送信を試みた失敗）。
- **消費しない**: `dry-run` / `credentials-missing`（実送信していない）→ `queued`/`pending` のまま維持。
  - → 資格情報が無いだけで `failed` にはならない。復旧した次回実行で送信される。

## 文字数上限（fragment単位）

- **section単位ではなく fragment 単位**で送信予算に加える。本文へ完全に含まれた fragment の hash だけを `includedHashes` にする。
- 入り切らない fragment は `omittedHashes` として **pending 維持**（次回統合で再送、消失しない）。
- 単一巨大 fragment の切り詰め delivery は、**そのセクションに代表 fragment が1件だけ**の場合に限定。
- 省略注記は最悪ケース長を予約して予算計算するため、最終 slice ガードに依存しない（＝未掲載 fragment を sent 化しない）。
- 本文には「未掲載件数・未掲載セクション数・pendingとして次回へ持ち越し・確認先」を明記。
- `includedCount` は実際に本文へ含まれた件数を返す。

## 再送保証（pendingの永続化）

- `LINE_BATCH_DIR` は**安定ディレクトリ** `tmp/line-batch-pending`（日付別にしない）。`run-daily-complete.sh` は開始時に**削除しない**。
- crash途中 / HTTP・network失敗 / 同日再実行 / 翌日再実行 でも pending を失わない。実送信成功した fragment だけ削除。
- 一時ファイルは temp + rename で atomic。temp（`*.tmp-*`）は `.txt` 判定に一致せず誤送信されない。

## 環境変数

| 変数 | 意味 |
| --- | --- |
| `LINE_BATCH_DIR` | 設定時、各ステップは即時送信せず pending キューへ蓄積 |
| `LINE_CHANNEL_TOKEN` / `LINE_USER_ID` | LINE Messaging API 資格情報。未設定なら `credentials-missing`（実送信せず pending 維持） |
| `LINE_DRY_RUN=1` / `NOTIFY_MODE=off` | 実送信しない（本文を標準出力に出すのみ。pending 維持・attempts非消費） |

## JST 日付境界

- `deliveredAt`（UTC ISO）に加えて `deliveredDateJst`（Asia/Tokyo の YYYY-MM-DD）を保存し、当日判定はこれで行う。
- 旧 entry（`deliveredDateJst` 無し）は `deliveredAt` を JST 変換して比較（後方互換）。
- 例: UTC 2026-08-04T23:30 は JST 2026-08-05 08:30 → 当日 08-05 として数える。

## ledger 安全策

- **破損時**: 送信側 (`loadLedgerStrict`) は `.ledger.json.corrupt-<ts>` へ退避して送信を停止（重複送信を防ぐ安全側）。CLI は非致命の構造化エラーを返し `exit 0`。
- **本文欠落**（entryあり・fragment file無し）/ **orphan**（fileあり・entry無し）は `findLedgerAnomalies` で surface し、結果 JSON の `anomalies` に件数を出す（黙って無視しない）。orphan は queued として取り込む。
- **単一writer契約**: ledger の書き込みは daily pipeline の1プロセスを前提とする（並行実行しない）。
- **MAX_ATTEMPTS 到達後の手動復旧**: `requeueFailed` で `failed` を `queued` に戻す。手順例:

```bash
# .ledger.json をバックアップしてから、失敗entryを再queue（tsxワンライナー）
node --import tsx/esm -e 'import {loadLedger,saveLedger,requeueFailed} from "./src/line-batch-queue.ts"; const d=process.env.LINE_BATCH_DIR; const L=loadLedger(d); const {requeued}=requeueFailed(L); saveLedger(d,L); console.log("requeued",requeued);'
```

## 失敗時の挙動

- LINE送信失敗は daily pipeline を止めない（CLIは失敗時も `exit 0` + 構造化結果、`run_optional_step` でも二重非致命化）。
- 秘匿値（token/userId）はログ・エラー・結果JSON・ledger に出さない（`redactSecrets`）。

## テスト

```bash
node --import tsx/esm tests/line-consolidation.test.ts   # もしくは pnpm test
```

必須テスト1〜22（normal creds不足×6でfailedにならない/復旧後1回送信、urgent dry-run・creds不足のpending維持と非消費、
fragment単位予算で未掲載hashをsentにしない、単一巨大fragmentのみtruncated、TDnet同日重複防止、pending-retry再送、
JST境界count、corrupt ledger安全停止、missing fragment検知、omitted非delivered、秘匿値リダクション、LINE失敗の非致命、
実LINE未接続）を網羅。実ネットワークには接続しない（Fake/DryRunトランスポート・注入fetch・tempディレクトリのみ）。
