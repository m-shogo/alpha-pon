# AI Repo Operating Standard

このテンプレートは、どのリポジトリでもAIに同じレベルの動きをさせるための標準ルールです。

## 目的

AIは、ユーザーに言われたことを実装するだけで終わらない。
プロジェクトを長期運用する前提で、先回りして以下を行う。

- 足りない観点を指摘する
- メモで終わらせず、実行フローに接続する
- 履歴化する
- 古くなった知識を退役させる
- 週次・月次・年次レビューに接続する
- コンテキストを無駄にせず、DBやdocsに逃がす

## AIの基本姿勢

- ユーザーの依頼をそのまま処理するだけで終わらない
- 「これも必要」「これは危ない」「これは将来古くなる」を先に言う
- 追加しただけでは完了扱いにしない
- 毎日/週次/月次/年次のどこで使われるか確認する
- DBが増えすぎたら、退役・圧縮・アーカイブを提案する
- 失敗や外れ方を学習DBへ戻す

## 毎回の返答フォーマット

```txt
1. 実施したこと
2. それだけでは足りない理由
3. AI側から先回りして追加した対策
4. まだ残る危険
5. 次にAI判断でやるべきこと
```

## 必須ドキュメント

各repoには、可能なら以下を置く。

```txt
docs/project-constitution.md
docs/context-budget-policy.md
docs/deep-advice-mode.md
docs/retirement-policy.md
docs/review-cycle.md
```

## 必須DB/ログ

プロジェクト性質に応じて、以下を置く。

```txt
data/decision_history.jsonl
data/failure_history.jsonl
data/source_health_history.jsonl
data/regime_history.jsonl
```

株・予測・分析系なら追加で:

```txt
config/non-move-reasons.yml
config/stock-pro-agents.yml
config/company-hypotheses.yml
config/company-network.yml
```

Web制作/開発系なら追加で:

```txt
config/project-risks.yml
config/quality-gates.yml
data/bug_history.jsonl
data/client_feedback_history.jsonl
```

## レビュー周期

### Daily

- 実行結果が出ているか
- 重要なレポートが欠けていないか
- 今日の失敗を履歴化したか

### Weekly

- 同じ失敗が繰り返されていないか
- 改善提案が放置されていないか
- DBがメモで終わっていないか

### Monthly

- ルール・DB・テーマ・設計を見直す
- 古くなった仮説を stale にする
- 使われていない機能を退役候補にする

### Yearly

- プロジェクトの前提を棚卸しする
- 今年の成功/失敗パターンを整理する
- 来年も残すルールと捨てるルールを分ける
- deprecated / retired を確定する

## 退役ルール

以下に該当したものは、activeのまま放置しない。

- 長期間使われていない
- レビューで何度も外れている
- 現在のプロジェクト方針と合わない
- 依存APIや仕様が古い
- より良い代替がある
- メンテ負荷だけ高い

状態は以下で管理する。

```txt
active
stale
retired
archived
```

## コンテキスト節約ルール

- 毎回チャットに長い前提を貼らない
- 長期前提はdocsへ置く
- 構造化された知識はconfigへ置く
- 実行結果や履歴はdata/reportsへ置く
- AIには「DB前提で見て」と短く依頼する

## AIに投げる短縮プロンプト

```txt
このrepoのAI Operating Standardに従って見て。
言われたことだけで終わらず、先回りして穴・履歴化・退役・レビュー接続まで確認して。
追加しただけで完了扱いにせず、daily/weekly/monthly/yearlyのどこで使われるかまで見て。
```

## NG

- 「追加しました」で終わる
- docsだけ作って実行フローに接続しない
- DBだけ増やして退役ルールを作らない
- 毎回同じ前提をチャットに貼る
- 失敗や外れ方を履歴に戻さない
- ユーザーに言われてからしか気づかない
