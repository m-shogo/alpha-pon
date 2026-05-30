# alpha-pon Roadmap

alpha-pon は買い推奨アプリではなく、長期投資の調査候補・検証・反省・学習を自動化するためのローカルアプリです。

目的は「当てる」ことではなく、以下を継続的に改善することです。

- 調査候補の発見精度
- 誤報・速報・SNSノイズへの耐性
- 予想と実績の答え合わせ
- 弱いルールの発見
- 過去事例への過信防止
- 週次/月次の改善サイクル

---

## 現在地

実装済みの主な基盤:

- launchd による毎朝自動実行
- 世界ニュース取得とカテゴリ分類
- ソース信頼度 / 検証状態 / 誤報リスクの付与
- 誤報リスクの高い世界イベントを考察DBに保存しにくくする安全ゲート
- 銘柄 daily スコアリング
- ROIC / ROE / FCF / FCFマージン / ネットキャッシュ / 自己資本比率 / 競争優位スコア
- 類推使用DB / 類推予想DB
- 1日後 / 1週後 / 1か月後レビュー期限
- J-Quants 日足による価格ベース答え合わせ
- same / opposite / mixed / unknown 判定
- too_early / unknown を確定 outcome として保存しない再レビュー設計
- learn によるスコア帯別・ルール別・事例別集計
- weekly / monthly review
- maintain:data によるDB肥大化対策
- run-daily.sh の多重起動防止
- daily 失敗だけ critical、その他は通知して続行
- pnpm check で src と tests を型チェック

---

## Phase 1: 検証基盤を完成させる

優先度: S

目的:

方向性が合ったかだけでなく、どれくらい良かったか・悪かったかを検証できる状態にする。

実装候補:

- analogy outcome に以下を保存する
  - returnPct
  - benchmarkReturnPct
  - relativeReturnPct
  - maxDrawdownPct
  - startDate
  - endDate
  - dataAvailability
- learn / weekly / monthly で以下を集計する
  - スコア帯別の平均相対リターン
  - ルール別の平均相対リターン
  - 過去事例別の平均相対リターン
  - 1d / 1w / 1m 別の期待値
  - same率だけでなく、平均勝ち幅・平均負け幅
- 件数が少ない集計は strong conclusion にしない

完了条件:

- same率が高くても平均相対リターンが悪いルールを検出できる
- oppositeが少なくても損失幅が大きいルールを検出できる
- 週次/月次レポートで「方向性」と「値幅」を分けて見られる

---

## Phase 2: 弱いルールの分類を自動化する

優先度: S

目的:

弱いルールをいきなり削除せず、削除候補・弱体化候補・条件追加候補・サンプル不足に分ける。

実装候補:

- rule_diagnostics レポートを追加
- ルールごとに以下を分類
  - delete_candidate
  - weaken_candidate
  - condition_required
  - needs_more_data
  - keep_monitoring
- 判定条件例
  - n < 10: needs_more_data
  - n >= 10 かつ 方向性期待値 < 0: weaken_candidate
  - n >= 20 かつ 平均相対リターン < 0: condition_required
  - n >= 30 かつ 方向性期待値も平均相対リターンも悪い: delete_candidate
- 自動削除はしない
- rules.yml の変更案だけを出す

完了条件:

- 弱いルールを人間が判断しやすい形で出せる
- 過学習を避けるため、サンプル不足は明示される
- 自動で売買判断や買い推奨に繋がらない

---

## Phase 3: ニュースのクラスタリングと裏取りを強化する

優先度: S

目的:

同じ事件を複数記事として扱わず、公式・Tier1・SNSを束ねて信頼度を判断する。

実装候補:

- world_event_clusters.json を作る
- タイトル・URL・source・publishedAt・カテゴリ・タグで近いニュースを同一クラスタ化
- クラスタ単位で以下を計算
  - officialCount
  - tier1Count
  - socialCount
  - unverifiedCount
  - confirmationLevel
  - misinformationRisk
- SNSだけのクラスタは reflection DB に保存しない
- Tier1 または official が出たら保存候補にする
- Google News RSS の元ソース確認を強化

完了条件:

- 同じニュースの重複保存が減る
- SNS速報だけで仮説DBが汚れにくくなる
- 公式/Tier1で確認されたイベントが優先される

---

## Phase 4: 銘柄ごとの company memory を作る

優先度: A

目的:

銘柄ごとに、なぜ監視しているか・過去に何を外したか・どのルールと相性が悪いかを持つ。

実装候補:

- data/company_memory/{code}.json を作る
- 保存項目
  - watchReason
  - knownRisks
  - strongRules
  - weakRules
  - recurringWarnings
  - lastReviewedAt
  - recentOutcomes
- daily レポートに company memory を表示
- learn の結果から weakRules / strongRules を更新候補として出す
- 自動更新は慎重にし、まずは提案形式

完了条件:

- 銘柄ごとの反省が蓄積される
- 同じミスを繰り返しにくくなる
- 新しいニュースを過去の監視理由と照合できる

---

## Phase 5: 開示・一次情報の確認を強化する

優先度: A

目的:

ニュースよりも公式情報・会社開示・TDnet/EDINETを優先する。

実装候補:

- TDnet / EDINET の取得結果を daily に接続
- 開示タイトルだけでなく、本文要約を追加
- 重要開示タイプを分類
  - 決算
  - 上方修正
  - 下方修正
  - 中計
  - 大型受注
  - 自社株買い
  - 増資
  - 不祥事
  - M&A
- 開示が確認できないニュースは通知レベルを下げる
- 一次情報未確認の候補には必ず warning を出す

完了条件:

- 速報ニュースより会社開示を優先できる
- 下方修正・増資・不祥事を見落としにくくなる
- ニュースだけで高スコアになりにくい

---

## Phase 6: バックテストとウォークフォワード検証

優先度: A

目的:

未来のデータを見ずに、過去時点での判断だけで検証する。

実装候補:

- historical score snapshot を保存
- train / validation / test の期間分割
- walk-forward 検証
- 閾値変更の前後比較
- 変更前ルールと変更後ルールの成績比較
- ルール追加時に過去データへ過剰適合していないか確認

完了条件:

- 閾値を変えた理由が残る
- 変更後に本当に改善したか確認できる
- 過去事例の後付け最適化を避けられる

---

## Phase 7: レポートを意思決定用ではなく調査用に磨く

優先度: B

目的:

買う/買わないではなく、次に調べることが明確なレポートにする。

実装候補:

- reports/latest.md に以下を追加
  - 今日見るべき一次情報
  - 反証条件
  - まだ分からないこと
  - 調査優先度
  - 通知理由と通知しなかった理由
- レポート冒頭に安全注意書きを固定表示
- 過去の類推はスコア加点ではなく、仮説セクションに隔離

完了条件:

- レポートを読んだときに「何を確認すべきか」が分かる
- 買い煽りに見えない
- 不確実性が明示される

---

## Phase 8: 運用監視・復旧性を上げる

優先度: B

目的:

毎朝動くアプリとして、止まった時に原因が分かるようにする。

実装候補:

- pipeline_status_latest.json を作る
- 各ステップの start/end/status/duration/error を保存
- 連続失敗回数を記録
- J-Quants 認証失敗、RSS失敗、LINE失敗を分類
- daily本体失敗だけ critical
- 非critical失敗は warning に集約
- 古い lock の検出と警告

完了条件:

- どのステップで失敗したかすぐ分かる
- 失敗が続いているか分かる
- daily の成功/失敗が一目で分かる

---

## Phase 9: UI / ダッシュボード化

優先度: C

目的:

蓄積データを見やすくし、改善サイクルを回しやすくする。

実装候補:

- ローカルHTML or Next.js dashboard
- 表示項目
  - 今日の調査候補
  - 類推レビュー結果
  - 弱いルール候補
  - 週次/月次レビュー
  - DBメンテ状態
  - company memory
- 買い推奨ではなく、調査ステータス管理に寄せる

完了条件:

- CLI/Markdownを見なくても全体像が分かる
- 反省・改善候補を一覧できる
- 手動確認しやすい

---

## 実装順の推奨

1. Phase 1: 価格レビューを期待値化
2. Phase 2: 弱いルール分類
3. Phase 3: ニュースクラスタリング
4. Phase 4: company memory
5. Phase 5: 一次情報強化
6. Phase 6: walk-forward検証
7. Phase 8: pipeline status
8. Phase 7: レポート改善
9. Phase 9: UI化

---

## 絶対に守る設計原則

- 買い推奨にしない
- 過去事例をスコア加点に直接使わない
- 類推は仮説として保存し、後で答え合わせする
- SNS速報や未確認情報をDBに混ぜない
- 公式情報・Tier1報道・会社開示を優先する
- 件数が少ない学習結果で強い判断をしない
- 自動でルール削除しない
- daily 本体以外の失敗で全体を止めない
- daily 失敗だけ critical 扱いにする
- 価格データとベンチマーク比で必ず答え合わせする

---

## 中学生向けまとめ

alpha-pon は、株を買うためのアプリではなく、毎日ニュースや株価を見て「何を調べるべきか」をメモして、あとで答え合わせするアプリです。

これから完璧にするには、まず「予想が当たったか」だけではなく、「どれくらい良かったか・悪かったか」まで記録します。

その次に、弱いルールを見つけます。ただし、すぐ消すのではなく、データが足りないのか、本当に弱いのかを分けます。

さらに、うわさ話やSNS速報にだまされないように、公式発表や信頼できるニュースを優先します。

最後に、銘柄ごとの反省ノートを作って、同じミスをしないようにします。
