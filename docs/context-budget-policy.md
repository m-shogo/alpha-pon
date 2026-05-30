# alpha-pon コンテキスト節約ポリシー

目的: ChatGPT/Codexに毎回長い説明を貼らず、DB・設定・レポートを読ませて判断する。

## 毎回チャットに貼らないもの

以下はDB化済み、またはDB化対象なので、毎回説明しない。

- 株Proの常識・禁止事項
- 上がらなかった理由分類
- 株Proエージェント定義
- 時代変化シナリオ
- 現在情勢コンテキスト
- テーマ別具体銘柄仮説
- 親会社・関連会社・競合
- ダメ条件・反証条件
- 一次情報サブタイプ分類

## 参照するDB

| 目的 | ファイル |
|---|---|
| 株Pro憲法 | `docs/pro-investing-constitution.md` |
| 深掘り指示 | `docs/deep-advice-mode.md` |
| 上がらなかった理由分類 | `config/non-move-reasons.yml` |
| 株Proエージェント | `config/stock-pro-agents.yml` |
| 時代変化シナリオ | `config/regime-scenarios.yml` |
| 現在情勢 | `config/current-regime.yml` |
| 具体銘柄仮説 | `config/company-hypotheses.yml` |
| 情勢レポート | `reports/regime_scenarios_latest.md` |
| 株Pro考察レポート | `reports/stock_pro_agent_latest.md` |

## チャットで渡す最小指示

```txt
alpha-ponのDBを読んで、買い推奨ではなく調査・検証用に考察して。
特に docs/pro-investing-constitution.md、docs/deep-advice-mode.md、config/current-regime.yml、config/company-hypotheses.yml、config/non-move-reasons.yml を前提にして。
上がる理由より、上がらなかった理由と見落としを重視して。
```

## Codex/ChatGPTに依頼する時の短縮形

```txt
DB前提で、stock-pro-agent-reportを更新・確認して。
メモで終わらせず、情勢→カテゴリ→具体銘柄→良い/悪い/上がらない理由→次の確認に落として。
```

## 追加DB候補

今後、毎回調べるならDB化する。

- 業種別ベンチマーク
- 親会社/子会社/主要株主/関連会社ネットワーク
- 主要テーマ別の代表銘柄リスト
- PER/PBR過去レンジ
- セグメント別売上・利益比率
- 決算期・イベントカレンダー
- 企業ごとの過去の外れ理由
- source health履歴
- regime履歴

## 運用ルール

- チャットには長い前提を貼らない
- 前提はDBへ入れる
- 毎朝のレポートはDBを読んで作る
- 足りない情報はDB候補として記録する
- DBが古くなったら `status: stale` にする
- 具体銘柄は買い推奨ではなく、仮説・反証・確認対象として扱う
