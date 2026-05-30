# alpha-pon ペルソナ別ギャップ監査

alpha-pon は買い推奨ではなく、長期投資の調査候補・検証・反省のためのアプリです。

このドキュメントは、運営時に「誰の視点で何が足りないか」を確認するためのチェックリストです。

## 1. 長期投資Pro

目的: 良い会社を高すぎない局面で調査候補にする。

見るべき情報:

- ROIC / ROE / FCF / FCFマージン
- ネットキャッシュ / 自己資本比率
- 営業利益率の安定性
- 売上・利益の継続性
- 競争優位スコア
- PBR / PER / 過去レンジ
- 高値からの下落率
- 決算前後の値動き
- TOPIXや業種指数との相対比較

不足があれば追加するもの:

- 業種別ベンチマーク
- バリュエーションの過去レンジ
- 配当・自社株買い・消却の質
- 営業利益率やFCFの複数年トレンド

## 2. 世界情勢・マクロ担当

目的: 個別銘柄ニュースだけでなく、構造変化を拾う。

見るべき情報:

- 金利 / 為替 / 原油 / 電力価格
- 地政学リスク
- サプライチェーン制約
- 重要鉱物 / 半導体 / 電力網 / 水不足
- AIデータセンター制約
- 海底ケーブル / サイバー / 保険危機

不足があれば追加するもの:

- 構造リスクのカテゴリ別スコア
- 影響を受けやすい業種・銘柄の紐付け
- 単発ニュースと構造変化の分離

## 3. 一次情報・誤報リスク管理者

目的: SNSや速報に引っ張られず、公式情報を優先する。

見るべき情報:

- TDnet
- EDINET
- 会社IR
- Tier1報道
- ソース信頼度
- 速報性
- 誤報リスク
- 検証状態

不足があれば追加するもの:

- 一次情報missing時の通知抑制
- confirmed/caution/blockのカテゴリ別成績
- 自社株買い・下方修正・増資・不祥事などのサブタイプ分類

## 4. データ運用者

目的: 毎朝の自動実行が壊れていないか確認する。

見るべき情報:

- pipeline_status_latest.json
- source_health_latest.md
- CI結果
- Artifact
- DBサイズ
- fetch error count
- dataQuality missing / partial

不足があれば追加するもの:

- 取得失敗の連続日数
- source health の履歴
- proposal history のdaily pipeline接続
- 通知の過剰発火チェック

## 5. 検証・学習担当

目的: 予想が当たったかではなく、ルールが本当に期待値を持つかを見る。

見るべき情報:

- 1日後 / 1週後 / 1か月後レビュー
- same / opposite / mixed / unknown
- 銘柄リターン
- ベンチマーク比
- スコア帯別成績
- ルール別成績
- 事例別成績

不足があれば追加するもの:

- 件数不足のルールを削除しない保護
- 弱いルールの連続検知
- ルール変更前後の比較
- walk-forward的な期間分割

## 6. 毎朝見る自分

目的: 今日見るべきものを迷わず判断する。

見る順番:

1. reports/pipeline_status_latest.json
2. reports/source_health_latest.md
3. reports/proposals_latest.md
4. reports/proposal_streaks_latest.json
5. reports/latest.md
6. reports/rule_diagnostics_latest.md
7. reports/learning_latest.md

判断ルール:

- dailyが失敗していたら、その日の候補は使わない
- source healthにS級の欠損があれば、候補より取得元を確認する
- proposalsのS優先度は最優先
- proposal streaksに同じSが続くなら放置中の重要課題
- Holdは判断保留。自動でルール変更しない

## 現時点の最大の残り穴

- proposal-history は手動実行とCI接続済みだが、run-daily.sh本体にはまだ未接続
- バリュエーション過去レンジはまだ薄い
- 一次情報サブタイプ分類はまだ薄い
- source health自体の履歴化はまだ薄い
- ルール変更前後の効果比較はまだ薄い

## 次の優先順位

1. proposal-history を run-daily.sh 本体に接続
2. バリュエーション過去レンジを追加
3. 一次情報サブタイプ分類を追加
4. source health 履歴を追加
5. ルール変更前後の比較レポートを追加
