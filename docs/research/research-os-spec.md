# Research OS 仕様書 v1

Alpha Pon の研究基盤（Research OS）の正本仕様。

## 0. 役割分担（最重要）

| 主体 | 役割 | 禁止事項 |
| --- | --- | --- |
| **ChatGPT（Scheduled Tasks）** | 毎時の研究。Edge 探索・仮説生成・Historical 収集・棄却判断 | Research OS のスキーマを勝手に変えること |
| **Research OS（このリポジトリ）** | 研究を蓄積・検証・監査するための器 | 研究すること。Edge を発明すること |
| **GitHub Actions** | 整合性・PIT・重複・Gate の機械チェックと生成物更新 | 新 Edge の作成、投資判断、Production 昇格の決定 |

Research OS の目的は Edge の数ではなく、**再現性 / 保守性 / 監査性 / 品質 / 実利益** の最大化。

## 1. 正本レイアウト

```
research/
  edge_registry/edges/<edge_id>.yml       # Edge 1件 = 1ファイル（人手・LLM編集の正本）
  edge_registry/index.generated.json      # 生成物（手編集禁止）
  historical/analogs/<analog_id>.yml      # Historical Analog（作成後は完全 immutable）
  counterfactual/counterfactuals.jsonl    # Append Only
  confounder/confounders.jsonl            # Append Only
  research_log/YYYY-MM.jsonl              # Append Only（毎時ログ）
  checkpoint/latest.json                  # 唯一の「上書き可」ファイル
  checkpoint/history/<ts>.json            # スナップショット（immutable）
  holdout/vault.manifest.json             # Holdout の封印定義
  holdout/access_log.jsonl                # Append Only（開封記録）
  queue/queue.generated.json              # 生成物（VOI Scheduler 出力）
  dashboard/dashboard.generated.md        # 生成物
  reports/*.generated.*                   # 生成物（Net Alpha / Decay など）
  schemas/*.schema.json                   # JSON Schema（契約の正本）
  fixtures/valid|invalid/                 # テスト用固定データ
docs/research/                            # 仕様・運用ドキュメント
docs/prompts/                             # ChatGPT に渡すプロンプトの正本
docs/roadmaps/                            # Research OS 自体のロードマップ
src/research/                             # 実装（純ロジック）と CLI
tests/research/                           # テスト
```

### 生成物の見分け方

ファイル名に `.generated.` を含むものは **すべて CLI / CI が生成する**。
人間も ChatGPT も直接編集してはいけない。CI は再生成して差分が出たら失敗する。

## 2. 不変条件（Invariants）

CI が機械的に強制する。破ると merge できない。

| ID | 不変条件 | 強制方法 |
| --- | --- | --- |
| INV-1 | `*.jsonl` は Append Only（既存行の変更・削除禁止） | `research:check:append-only`（git diff 解析） |
| INV-2 | Historical Analog は作成後 immutable | 同上（ファイル単位で内容変更を検知） |
| INV-3 | Edge の `id` / `hypothesis` / `createdAt` は immutable | 同上（フィールド単位で HEAD と比較） |
| INV-4 | 重複 Edge 禁止（id 重複・仮説フィンガープリント重複） | `research:validate` |
| INV-5 | 重複 Historical 禁止（id 重複・(company, eventDate, eventType) 重複） | 同上 |
| INV-6 | Future Leakage 禁止（`observedAt > decisionAt` の証拠を使った backtest は不可） | `research:check:pit` |
| INV-7 | 未来日付禁止（`observedAt` / `at` が実行時刻より後） | 同上 |
| INV-8 | 未検証 Production 禁止（Production Gate 全項目 PASS が必須） | `research:check:gate` |
| INV-9 | Holdout は Production 判定時にのみ開封。開封は記録される | `research:check:holdout` |
| INV-10 | すべての生成物は決定論的（同入力→同出力、タイムスタンプ以外） | CI の再生成差分チェック |

## 3. データ契約

各スキーマの正本は `research/schemas/*.schema.json`。主要フィールドの意味だけここに書く。

### 3.1 Edge（`edge.schema.json`）

- `id`: `kebab-case`。ファイル名と一致。immutable。
- `status`: `idea` → `research` → `shadow` → `production` / `rejected` / `deprecated`
- `hypothesis`: 検証可能な1文。immutable（変えたくなったら新 Edge を作る）
- `hypothesisFingerprint`: 仮説の正規化ハッシュ。重複 Edge 検知に使う（CLI が算出）
- `mechanism`: 因果機序。「なぜ利益が残るのか」
- `confidence`: 0–1
- `priority`: `S`/`A`/`B`/`C`
- `evidence[]`: 一次情報への参照。`observedAt` 必須（PIT の基準時刻）
- `voiInputs`: VOI スコアの入力（§4）
- `promotionGate`: Production Gate の各項目の状態（§5）
- `decay`: Edge Decay の監視状態（§6）
- `rejection`: `status: rejected` のとき必須。棄却理由と反証証拠
- `owner`: 研究の担当（既定 `chatgpt-hourly`）
- `lastUpdate`: ISO 日付

### 3.2 Historical Analog（`analog.schema.json`）

過去事例。作成後 immutable。`marketReaction` と `outcome` は
PIT 上「事後に確定した事実」なので、`measuredAt` を必ず持つ。

### 3.3 Counterfactual / Confounder

- Counterfactual: 「そのイベントが無かった場合」の比較対象（ピア・指数・マッチング銘柄）
- Confounder: 同日イベント・指数・決算・需給・金利・為替・地政学など交絡因子

### 3.4 Research Log

毎時 1 行以上の Append Only ログ。`type` は
`research` / `analog_added` / `edge_created` / `edge_rejected` / `edge_promoted` /
`data_gap` / `os_change`。

### 3.5 Checkpoint

「次回が必ず前回の続きから始まる」ための唯一の入口。
`latest.json` のみ上書き可。上書き時は必ず `history/` にスナップショットを残す。

## 4. VOI Scheduler（Research Queue）

毎時、ChatGPT は `research/queue/queue.generated.json` の **1位** を研究する。
思いつき順の研究は禁止。

スコアは決定論的な加重和：

```
voi = Σ wᵢ · componentᵢ   （component は 0–1 に正規化）
```

| component | 意味 | 出所 |
| --- | --- | --- |
| `expectedRoi` | 期待 Net Alpha の大きさ | `voiInputs.expectedNetAlphaBps` を正規化 |
| `uncertaintyReduction` | 1時間の研究で減る不確実性 | `voiInputs.uncertaintyReduction` |
| `sampleGap` | 必要サンプルに対する不足率 | `requiredSamples` と `currentSamples` |
| `historicalGap` | Historical Analog の不足率 | `requiredAnalogs` と実際の紐付き件数 |
| `productionProximity` | Production Gate の充足率（近いほど高い） | `promotionGate` |
| `decayUrgency` | Decay 監視の期限超過度 | `decay.lastCheckedAt` と `reviewIntervalDays` |
| `executionImprovement` | Execution 改善で救える見込み | `voiInputs.executionImprovement` |
| `costPenalty` | 研究コスト（負の重み） | `voiInputs.researchCost` |

重みは `research/queue/weights.yml`。同点は `id` の辞書順で決定論的に解決する。
`status` が `rejected` / `deprecated` / `production` の Edge は Queue から除外
（Production は Decay 監視期限が来たときだけ再浮上する）。

## 5. Production Gate

以下 **11 項目すべて** が `pass` になるまで `status: production` は不可。
`research:check:gate` が違反を検出したら CI は失敗する。

1. `sufficientSamples` — 十分なサンプル数
2. `holdoutPass` — Holdout PASS
3. `pitSafe` — PIT Safe
4. `netAlphaPositive` — Net Alpha が正
5. `executionFeasible` — Execution 可能
6. `liquiditySufficient` — Liquidity 十分
7. `borrowCostCovered` — Borrow 込みで利益
8. `confoundersRemoved` — Confounder 除去
9. `counterfactualExplained` — Counterfactual 説明可能
10. `decayChecked` — Edge Decay 確認
11. `falseDiscoveryGuard` — False Discovery Guard 通過

各項目は `{ state: pass|fail|unknown, evidence: string, checkedAt: date }`。
`evidence` が空の `pass` は CI が拒否する（自己申告 PASS の禁止）。

## 6. Edge Decay Monitor

`production` / `shadow` の Edge は `decay.reviewIntervalDays` ごとに再検証する。
期限超過は Queue で最優先に浮上し、Dashboard に `decay_overdue` として出る。

## 7. Backtest / Net Alpha

`src/research/backtest.ts` の `runBacktest(spec, series)` が共通インターフェース。

- 価格系列は**注入**する（OS は価格を取りに行かない）
- `entry` / `exit` / `holdingPeriodDays` / `side` を spec で指定
- コストは `net-alpha.ts` が一括計上：手数料・スプレッド・スリッページ・
  マーケットインパクト・借株コスト（日割り）
- 出力は `grossReturnBps` と `netAlphaBps` を必ず分けて持つ
- **Liquidity 制約**：想定執行額が `participationLimit × 出来高` を超える日は
  執行不可として `executable: false` を返す

CI が自動実行してよいのは `research/fixtures/` の固定系列に対する backtest のみ
（deterministic かつ外部 IO なし）。実価格での backtest は人間が明示的に走らせる。

> 現状の制約：このリポジトリにはまだ実価格の履歴系列が無い（`data/prices/` は空、
> J-Quants Free は遅延あり）。したがって Net Alpha の**実測値**はまだ 1 件も無い。
> Backtest Framework は「価格が入った瞬間に走る器」として先に用意してある。

## 8. Holdout Vault

- `research/holdout/vault.manifest.json` が「封印された期間・銘柄」を定義する
- 研究中（`idea`〜`shadow`）はこの範囲のデータを一切参照しない
- Production 判定時のみ `research:holdout:open` で開封し、
  `holdout/access_log.jsonl` に理由付きで記録が残る（Append Only）
- CI は「Edge の研究期間と Holdout 期間が重なっていないこと」を検証する

## 9. 毎時のフロー

```
1. research:queue      → 今一番価値の高い研究テーマを1件決定
2. （ChatGPT が研究する。OS は関与しない）
3. research:new:*      → 成果を Edge / Analog / Counterfactual / Confounder に記録
4. research:validate   → スキーマ・重複・PIT を自己検証
5. research:checkpoint → 次回の続きを保存
6. git commit / push   → CI が全ガードを再実行し、生成物を更新
```

詳細な手順と書き込み契約は [../prompts/hourly-research.md](../prompts/hourly-research.md)。
