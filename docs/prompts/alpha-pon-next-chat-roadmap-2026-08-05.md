# Alpha Pon 次チャット統合プロンプト — 2026-08-05

このファイルは、Cloudflare D1接続完了後のAlpha Pon開発を新しいChatGPTチャットへ引き継ぐための統合プロンプトです。

会話や記憶ではなく、GitHubの最新main・コード・テスト・Research OSの正本を優先してください。

---

あなたは `m-shogo/alpha-pon` の継続開発担当です。

Repository:
https://github.com/m-shogo/alpha-pon

Local repository:
`/Users/m-shogo/Developer/personal/alpha-pon`

目的は、Alpha Ponを「ニュースを並べるアプリ」ではなく、

世界情勢・企業イベント・不祥事・特殊状況
→ 調査候補企業
→ 検証可能なEdge仮説
→ PIT安全な過去検証
→ コスト控除後の実測Net Alpha
→ 重要な変化だけ通知

まで一貫して扱える、長期運用可能な個人投資研究システムへ進化させることです。

買い推奨や自動売買を目的にせず、理由付きの調査候補を早く発見し、後で答え合わせできる設計を維持してください。

# 0. 現在の確定状態

最新main:
`dd9551a761f9be8db90570250cbd3e4f044bceda`

Cloudflare/D1は設定完了済みです。

- Worker:
  `https://alpha-pon.m-shogo-0409.workers.dev`
- Calendar:
  `https://alpha-pon.m-shogo-0409.workers.dev/calendar/`
- D1:
  `alpha-pon-market-events`
- D1 database ID:
  `7b90faf4-9834-4393-a921-275e0a68b398`
- 公開GET専用
- public write APIなし
- Cloudflare Access / Zero Trustなし
- 課金・クレジットカード登録なし
- Repository Secrets:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_D1_READ_API_TOKEN`
- `production` Environment Secret:
  - `CLOUDFLARE_D1_EDIT_API_TOKEN`
- GitHub Actions D1 dry-run:
  - Run `30970892738`
  - success
  - canonical 12件とremote D1は完全一致
  - added 0 / updated 0 / removed 0 / collision 0
  - applyは不要だった
- D1 bootstrapやmigrationを再実行しない
- scheduleはまだ追加しない

Cloudflare Token作成やSecret設定を最初からやり直さないでください。

# 1. 最初に必ず行うGrounding

編集前に次を確認してください。

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `research/README.md`
- `docs/research/research-os-spec.md`
- `docs/prompts/hourly-research.md`
- `docs/roadmaps/research-os-roadmap.md`
- `docs/roadmaps/edge-research-automation-roadmap-2026-08-04.md`
- `docs/implementation/workers-static-assets-migration-status.md`
- `docs/implementation/market-event-foundation-v1-status.md`
- `docs/implementation/storage-foundation-current.md`
- GitHub Issues #2、#3
- 最近のPR #18〜#28
- `.github/workflows/`
- `package.json`のresearch / calendar / D1関連scripts

次を実測してください。

```bash
git status --short --branch
git stash list
git log --oneline --decorate -20
git diff --stat
git diff
```

会話や古いstatus文書ではなく、現在のGit・コード・テストを正本として判断してください。

# 2. ローカル未コミット変更を絶対に失わない

現在、少なくとも次の変更がローカルに存在します。

```text
M apps/web/public/generated/alpha-pon-data.json
M apps/web/public/generated/hypotheses.json
M apps/web/public/generated/outcomes.json
M apps/web/public/generated/stock-candidates.json
M scripts/run-daily-complete.sh
M scripts/run-daily.sh
M src/notify.ts
?? src/send-consolidated-line.ts
?? tmp/
```

安全バックアップstashも残っています。

```text
current-local-changes-before-restoring-cloudflare-stash-2026-08-05
```

重要ルール:

- ローカル変更をrestore、reset、clean、checkoutで消さない
- stashを即削除しない
- `tmp/`や生成物を無条件でcommitしない
- 生成JSONは、手編集か正規generatorによる変更かを確認する
- 現在の変更を最初に別branchへ保護する
- 既存stashは、現在の作業がcommit・push・CI greenになるまで残す
- 同名ファイルの差分を一括で上書きしない

# 3. 最優先 — LINE通知統合作業を完成させる

ローカル変更の中心と思われる次を最初にレビューしてください。

- `src/send-consolidated-line.ts`
- `src/notify.ts`
- `scripts/run-daily.sh`
- `scripts/run-daily-complete.sh`
- 関連するnotification dedupe / pipeline message / morning summaryコード

目標:

- 朝の通常通知を、細切れではなく1回の統合メッセージへまとめる
- 本当に緊急な通知だけ即時送信する
- 同じ内容の重複通知を防ぐ
- pipeline summaryと銘柄summaryが二重送信されない
- 重要情報を削りすぎない
- 事実・既知情報・推定・意見を混ぜない
- 「買い推奨ではない」を維持
- LINE API失敗がdaily pipeline全体を壊さない
- TokenやUser IDをログ、例外、生成物へ出さない
- 1回のLINE送信上限や文字数制限に安全に対応する
- 0件、1件、多数件、urgent混在、部分失敗をテストする
- Mac通知との責務重複を整理する
- dry-runまたはmock transportを用意し、実送信せず確認できるようにする

まず現状の意図を壊さず、必要なテストを追加し、小さなcommitで完成させてください。

# 4. Cloudflare / Calendarの完了状態を正本へ反映

コードは進んでいる一方、次のstatus文書やIssueには古い状態が残っています。

- `READY_PENDING_CLOUDFLARE_REGISTRATION`
- `PUBLIC_READ_ONLY_D1_FIX_PR_CI_PENDING`
- Pages / Access前提
- Cloudflare未接続前提
- Issue #2、#3の未チェック項目

実測状態に合わせて更新してください。

やること:

1. Calendar / Workers / D1の現在状態を `CALENDAR_V1_OPERATIONAL` 相当に更新
2. PR #14〜#28とD1 dry-run Run `30970892738`の証拠を記録
3. Access / Zero Trustを使わない現在方針へ統一
4. Pages前提の古い記述をWorkers Static Assetsへ統一
5. Secret値は書かず、Secret名だけ記録
6. `OWNER_EMAIL`の残存参照を調査
   - runtimeで不要ならコード・文書から整理
   - Cloudflare Dashboard上の削除が必要なら、外部作業として明示
7. Issue #2と#3を現在の実装状態へ更新
   - 完了項目を正確に反映
   - 未完了をPhase別に残す
   - 古い設計を完了扱いに偽装しない

# 5. Research OSを空の器から実働状態へ移す

現状は以下です。

- Research OS v1基盤: 実装済み
- Edge Registry: 0件
- Queue: 空
- Checkpoint: 未作成
- Historical Analog: 0件
- Counterfactual: 0件
- Confounder: 0件
- 実価格系列: なし
- Net Alpha実測値: 0件
- Productionへ昇格可能なEdge: 0件

生成物は直接編集しないでください。

```text
research/edge_registry/index.generated.json
research/queue/queue.generated.json
research/dashboard/dashboard.generated.md
research/reports/*
```

## 5-A. 最初のEdgeを登録

既存の大量の研究文書を無条件に一括移行せず、最も成熟していてユーザーの目的に合うEdgeから始めてください。

第一候補:

`Known-Bad Event Repricing Edge`
既知悪材料・正式イベント通過売り

対象:

- 株主総会・継続会
- 記者会見
- 第三者委員会最終報告
- 行政処分
- 訴訟・判決
- 訂正決算
- 改善報告書
- 経営者・著名個人の不祥事
- 悪材料が既知か、新規判明かの差

既存の関連文書を調査し、重複・近似Edgeを統合してください。

最低限:

- Edge定義1件
- mechanism
- universe
- event types
- direction
- entry/exit候補
- PIT requirements
- confounders
- execution constraints
- falsification conditions
- hard blockers
- source policy
- `snsUsed: false`
- statusはIdeaまたはResearch
- 根拠のないGate passなし

同時に、最初のResearch LogとCheckpointを作り、`nextCandidates`を空にしないでください。

候補として、次も重複確認してください。

- Exchange Sanction Ladder
- Remediation Half-Life / Improvement-Status Clock
- Regulatory Clock Slippage
- Audit Opinion State Transition
- 個人不祥事・経営者依存Edge
- Kioxia型企業構造イベント
- Starlink型将来需要
- 外部犯罪の舞台になっただけの企業は株価影響が限定的、という反証候補

# 6. Research OS v2最優先 — PIT価格ストア

Research OSロードマップに従い、最優先で実装してください。

目的:

実価格・ベンチマーク・取得時点をAppend Onlyで保存し、将来改訂や先読みで過去検証を書き換えられないようにする。

想定正本:

```text
research/prices/<code>.jsonl
research/prices/benchmarks/<benchmark>.jsonl
```

ただし既存設計との競合がある場合は、第二の正本を作らず既存契約へ統合してください。

必要項目:

- code / market
- tradingDate
- observedAt
- source
- sourceVersion
- OHLCV
- adjusted / unadjustedの区別
- adjustment factor
- split・併合・配当等のcorporate action情報
- suspension / no-trade / missing reason
- benchmark code
- sector benchmark
- license classification
- ingestion run ID
- content hash
- revision / supersession規則
- first executable timestamp

必須品質:

- Append Only
- PIT安全
- 未来データ拒否
- 重複・改訂検知
- trading calendar対応
- 休場日・売買停止を安易にforward fillしない
- corporate action調整を二重適用しない
- timezoneをJSTで明示
- 日足の「取得可能時刻」と「取引日」を混同しない
- adjusted closeだけに依存しない
- TOPIX・業種指数等のbenchmarkを同時に扱える
- 実データが無ければ捏造しない

データ取得候補:

- J-Quants
- JPX一次データ
- 既存MacローカルDB / archive / sidecar
- 利用許諾済み市場データ

ライセンスが不明なデータはGitへcommitせず、Mac local onlyにしてください。

外部credentialがなくても、次は完成させてください。

- provider interface
- schema
- validator
- append-only writer
- importer
- deterministic fixture
- PIT tests
- corporate action tests
- benchmark tests
- data gap report
- local-only storage boundary
- runbook

# 7. Signal StoreとEvent Studyを実データへ接続

PIT価格ストアの次に進めます。

## Signal Store

Edgeやmarket eventからBacktest入力を自動生成してください。

保持項目:

- edgeId
- issuer / code
- eventId
- signalGeneratedAt
- publicObservedAt
- firstExecutableAt
- direction
- confidence
- source IDs
- entry rule
- exit rule
- blocked reason
- confounder references
- training / holdout区分

## Event Study

最低限の窓:

- prior close → next open
- D0 open → close
- D0 close → close
- D+1
- D+3
- D+5
- 必要に応じてD+10 / D+20

補正:

- TOPIX
- sector benchmark
- betaまたはmatched control
- volume shock
- gap
- spread proxy
- liquidity
- earnings / guidance / capital action
- index event
- block trade
- macro event
- borrow availability / cost

Gross returnだけでなく、必ずNet Alphaへ接続してください。

# 8. Confounder・Counterfactual・Historical Analogを実働化

一次情報から次を機械的に候補出しできるようにしてください。

- 同日決算
- 業績修正
- 配当・自己株買い
- 増資・CB
- TOB・MBO・再編
- 指数採用・除外
- 大口売買
- 市場全体急落
- 業種ショック
- 災害・外部犯罪
- 経営者本人の問題
- 企業内部の会計・統制問題

「会社内部の問題」と「外部事件の舞台になっただけ」を混同しない構造にしてください。

Historical Analogは作成後immutableです。後から内容を直すのではなく、新しいrecordまたはrevision relationで補正してください。

# 9. Edge Diversity / Decay / Opportunity Cost

PIT価格とSignal Storeが動いた後、以下を順番に実装してください。

1. Edge同士の相関クラスタ
2. 同じ因子への集中度
3. issuer concentration
4. recent vs historical Net Alpha差
5. decay scoreの自動計算
6. QueueのOpportunity Cost表示
7. 研究しないことの損失
8. 100 Edge超を見据えた近似重複検知のO(n²)改善

Production Gateを自動でpassにしないでください。機械計算結果と人間判断を分けてください。

# 10. Self-hosted Runnerと毎時研究

Mac self-hosted runnerの既存契約・sidecar・archiveを確認してください。

役割:

- GitHub-hosted CI:
  - schema
  - contract
  - small fixture
  - deterministic generation
  - security / append-only audit
- Mac self-hosted runner:
  - historical DB
  - archive scan
  - market join
  - large backtest
  - Edge experiment
  - holdout evaluation

必要workflow:

- `edge-hourly-light`
- `edge-research-heavy`
- `edge-daily-integrity`

ただし、いきなりcronを有効化しないでください。

順序:

1. workflow_dispatch
2. dry-run
3. artifact確認
4. idempotency確認
5. failure recovery確認
6. 明示承認後にschedule

同じheavy jobを重複起動しないでください。

# 11. Calendar自動収集の後続

Calendar本体は運用可能です。次は公式日程の自動収集を別workstreamで進めてください。

優先:

- 決算発表日
- TDnet / EDINET / JPX日程
- 株主総会・継続会
- 記者会見
- 第三者委員会報告予定
- 行政処分・改善報告期限
- 訴訟・判決予定
- TOB期限
- ロックアップ解除
- 子会社上場
- スピンオフ
- 親子上場解消
- PEファンド出口
- AI・半導体・宇宙の大型再編
- D+1 / D+5 / 1か月 / 3か月レビュー

未確定日を確定日として登録しないでください。

時間精度:

- exact
- date-only
- window
- unknown

を維持してください。

# 12. 絶対に守る安全条件

- SNS、掲示板、匿名投稿、インフルエンサーを根拠にしない
- 新規事実 / 既知事実 / 仮定 / 意見を分離
- 個別株の結論前に、最新の公式IR・TDnet・EDINET・JPX・主要報道を再確認
- 古い会話情報を現在の事実として扱わない
- 実価格・収益率・勝率・Net Alphaを捏造しない
- 自動売買しない
- Production昇格を自動化しない
- production score / thresholdを証拠なく変更しない
- D1 destructive deleteなし
- D1 bootstrap再実行なし
- public write APIなし
- Access / Zero Trust追加なし
- Cloudflare billing変更なし
- GitHub plan変更なし
- Secret値を表示・記録・commitしない
- 生成物を手編集しない
- JSONL append-onlyを破らない
- Historical AnalogとCheckpoint historyを変更しない
- Holdoutを研究途中で開封しない

# 13. Git運用

- 最新mainを基準にする
- ローカル未コミット変更を保護してからbranchを作る
- 1 commit 1 intent
- 大きな一括commitを避ける
- 無関係な変更を混ぜない
- 各フェーズでtestsを追加
- CI greenを確認
- 必要に応じて小さなPRへ分割
- PR本文に以下を書く
  - 目的
  - 実測した開始状態
  - 変更
  - 変更しないもの
  - 安全境界
  - tests
  - 未完了
  - 次のcheckpoint
- CI失敗時はログを確認して原因を修正
- greenになるまで進める
- mainへ直接危険な変更を入れない

# 14. 優先実行順

次の順で止まらず進めてください。

1. Groundingとローカル変更保護
2. LINE統合通知の完成・テスト・PR
3. Cloudflare / Calendar status文書とIssue整合
4. 最初のEdge Registry登録
5. Research Log / Checkpoint作成
6. PIT価格ストア
7. Signal Store
8. Event StudyとBacktest実データ接続
9. Confounder / Counterfactual / Analog拡張
10. Edge Diversity / Decay / Opportunity Cost
11. Self-hosted runner manual workflows
12. Calendar公式日程collector
13. Dashboard / Ops表示
14. repeated dry-run後にのみschedule候補を提示

# 15. 完了報告

各作業の最後に必ず報告してください。

- 開始SHA
- branch
- commit一覧
- PR URL
- 変更ファイル
- tests / CI結果
- 実データ件数
- Edge件数
- Analog件数
- Signal件数
- Backtest件数
- PIT違反件数
- unresolved confounder件数
- D1 / Cloudflareを変更したか
- Secretや課金を変更したか
- 残っているblocker
- 次に行うべき1〜3件
- Research Checkpointの`nextCandidates`

外部credential、Cloudflare Dashboard操作、ライセンスデータ、Mac runner停止など本当に外部作業が必要な場合だけ停止してください。

停止しても、実装可能なschema、tests、fixtures、runbook、dry-run、validation、handoffまでは先に完成させてください。

質問で細かく止まらず、安全側で最善判断し、実装・レビュー・テスト・小さなcommit・PR・CI確認まで自律的に進めてください。
