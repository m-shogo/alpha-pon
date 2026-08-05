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

## ストレージ構成

```text
tmp/line-batch-pending/
  .ledger.json                        # 配信台帳（状態の正本）
  .ledger-blocked.json                # block marker（存在時は送信停止）
  .ledger.json.corrupt-<ts>           # 破損ledgerの退避
  fragments/
    <hash>.fragment.json              # fragment envelope（kind を durable 永続化）
```

### Fragment envelope schema

crash 復旧で kind を本文推測に依存しないため、fragment は version 付き envelope として atomic 保存する（filename は content hash 由来）。

```ts
type FragmentEnvelopeV1 = {
  version: 1;
  hash: string;      // = contentHash(text)。filename とも一致を検証
  kind: "normal" | "urgent";
  section: string;
  text: string;      // 通知本文（token/userId は絶対に入れない）
  queuedAt: string;
};
```

- `readEnvelope` は version / kind / **filename hash と envelope hash と contentHash(text) の三者一致** を検証し、不一致・破損は `null`（送信しない）。
- envelope は enqueue の最初に atomic 保存し、その後に ledger を更新する（crash しても kind と本文を失わない）。

## 配信状態（ledger）

`LINE_BATCH_DIR/.ledger.json` が正本。fragment 本文は `fragments/<hash>.fragment.json`（envelope / atomic write）。

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

## ledger 破損と block marker

- **破損検知（enqueue/sender どちらでも）**: 破損 `.ledger.json` を `.ledger.json.corrupt-<ts>` へ退避し、`.ledger-blocked.json`（`{reason,detectedAt,corruptBackupPath?}`。**本文/Secretは入れない**）を書く。**空ledgerで上書きしない**。
- enqueue 側も破損を空ledgerへ戻さない。新しい fragment 本文は envelope で保全しつつ、ledger は更新せず `ledger-corrupt` を返す。
- sender は **block marker を最優先で確認**し、marker があれば transport を呼ばず `status:"blocked"` を返して `exit 0`。fragment は削除しない。**人間が明示的に復旧するまで送信を再開しない**（marker を自動削除しない）。
- **anomaly**（黙って無視しない）: `findLedgerAnomalies` が `missingBody`（pendingだがenvelope無し）/ `malformedEnvelopes` / `ambiguousLegacy` を結果 JSON の `anomalies` に出す。

### corrupt ledger 復旧手順（手動）

1. `.ledger.json.corrupt-<ts>` と `.ledger-blocked.json` をバックアップ。
2. `fragments/*.fragment.json` の envelope 一覧を監査（kind/section/hash）。
3. ledger を既知 backup から復元、または envelope から再構築（`reconcileOrphanFragments` は envelope の kind を保持）。
4. `findLedgerAnomalies` で不整合を確認。
5. **明示的に** `clearBlockMarker`（`rm .ledger-blocked.json`）で marker を解除。
6. `LINE_DRY_RUN=1` で dry-run 確認。
7. real 運用へ復帰。

### ambiguous legacy `.txt` の扱い

- 旧 `.txt` は無条件削除しない。ledger entry があれば ledger の kind で envelope 移行。
- ledger も envelope も無く、本文から kind を確定できない legacy は **送信せず** `ambiguousLegacy` anomaly として人間確認待ち。契約上明確な TDnet 緊急開示ヘッダのみ urgent へ移行する（`🚨` 単独では確定しない）。

### MAX_ATTEMPTS 到達後の手動復旧

`requeueFailed` で `failed` を `queued` に戻す（runbook 用。自動では呼ばない）。

```bash
node --import tsx/esm -e 'import {loadLedger,saveLedger,requeueFailed} from "./src/line-batch-queue.ts"; const d=process.env.LINE_BATCH_DIR; const L=loadLedger(d); const {requeued}=requeueFailed(L); saveLedger(d,L); console.log("requeued",requeued);'
```

## single-writer（full complete pipeline lock）

- `run-daily-complete.sh` 全体（補助step + 通知enqueue + ledger書込 + 統合送信）を `scripts/pipeline-lock.sh` の `tmp/run-daily-complete.lock/` で1プロセスに限定する。
- atomic な `mkdir` で取得。取得失敗時は非致命 `skipped_locked` で `exit 0`（2番目のrunは ledger/fragment へ書き込まない）。
- `trap` で EXIT/INT/TERM 時に**自分が取得した lock だけ**削除。生存 PID の lock は奪わない。PID 不在の stale lock は `started_at` ごと `.stale-<ts>` へ退避してから再取得。lock 処理から LINE 通知は呼ばない。
- 既存 `run-daily.sh` の lock は run-daily.sh の実行区間のみを守る別責務（この complete lock はその後の通知処理まで守る）。

## urgent ledger 障害の非致命性

- `deliverUrgent` は ledger 破損/block を **throw せず** `ledger-corrupt` / `ledger-blocked` outcome で返す。
- `sendUrgentNotifications` / `sendUrgentDisclosure` は `safeDeliverUrgent` で包み、例外も握って警告のみ。macOS補助通知は表示、LINEは安全側に停止、本文は envelope で保全、retry budget 非消費。
- → 通知 ledger の障害だけで `daily.ts`（銘柄レポート・学習DB・JSON生成）が `exit 1` になることはない。

## exactly-once ではない（残る制約）

- 本実装は「送信前 dedupe + 成功時のみ delivered」で**通常の重複を強く抑止**するが、**exactly-once は保証しない**。LINE API へのリクエストが成功した直後、`markSent` を書く前にプロセスが crash すると、次回実行で同一 urgent が1回だけ再送される可能性が残る。
- ledger は best-effort な at-least-once 抑止であり、リモート送信結果とローカル ledger の atomic な二相コミットは行っていない。

## 失敗時の挙動

- LINE送信失敗は daily pipeline を止めない（CLIは失敗時も `exit 0` + 構造化結果、`run_optional_step` でも二重非致命化）。
- 秘匿値（token/userId）はログ・エラー・結果JSON・ledger・envelope・marker に出さない（`redactSecrets`）。

## テスト

```bash
node --import tsx/esm tests/line-consolidation.test.ts   # もしくは pnpm test
```

Round1〜3の必須ケースを網羅: creds不足のretry非消費/復旧後1回、urgent dry-run・creds不足のpending維持、
fragment単位予算で未掲載hashをsentにしない、単一巨大sole-memberのみtruncated、TDnet同日重複防止、pending-retry再送、
JST境界count、**corrupt ledger→enqueue→sender safe stop（block marker）**、**ledger破損でsendUrgentがdaily critical failureにならない**、
**normal/ScoreResult urgent/TDnet urgent の orphan envelope 復旧（kind保持）**、malformed/hash不一致envelope非送信、
ambiguous legacy非送信、**complete pipeline lock（同時2run目skip・live PID奪取なし・stale退避再取得）**、秘匿値リダクション。
実ネットワークには接続しない（Fake/DryRunトランスポート・注入fetch・tempディレクトリ・bash lockのみ）。
