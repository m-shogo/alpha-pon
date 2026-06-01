# alpha-pon

長期投資向けの調査候補・買い場候補自動発見アプリ。

> 自動売買しない。株価予想しない。買い推奨しない。  
> **調査候補を見逃さず、見落とし・上がらない理由・下がる理由を減らすためのツール。**

## 目的

毎日株価や開示を見に行かなくても、条件を満たした銘柄だけ通知してくれる。  
ただし、**買うかどうかは必ず自分で判断する。**

alpha-pon は、単に「良さそうな銘柄」を出すのではなく、以下を重視する。

- 公式IR・決算・株主総会・配当・資本政策を確認する
- 良い会社と良い投資タイミングを分ける
- 上がらない理由・下がる理由を先に考える
- 複数の株Pro視点で相談する
- 外れた理由を蓄積して、次の精度を上げる
- 政治・戦争・AI・宇宙/Starlink・気候・食糧・金利などの変化でPro知識を更新する

## Pro運用プレイブック

運用の入口は以下。

- [docs/operation-playbook.md](docs/operation-playbook.md)

毎朝・重要判断時・新規銘柄追加時は、このプレイブックの順番で確認する。

## 推奨実行コマンド

通常のdaily:

```bash
pnpm daily
```

Pro運用の完全版:

```bash
bash scripts/run-daily-complete.sh
```

政治・戦争・AI・宇宙/Starlink・気候・食糧・金利など、前提が変わりやすい時期の完全版:

```bash
bash scripts/run-daily-complete-with-refresh.sh
```

## 朝一で見る順番

まず司令塔を見る。

1. `reports/strategic_advice_latest.md`
2. `reports/pipeline_health_summary_latest.md`
3. `reports/pro_knowledge_refresh_latest.md`
4. `reports/stock_pro_committee_latest.md`
5. `reports/stock_pro_summary_latest.md`

必要に応じて詳細を見る。

- `reports/company_onboarding_audit_latest.md`
- `reports/stock_pro_quality_audit_latest.md`
- `reports/stock_pro_improvement_roadmap_latest.md`
- `reports/company_network_latest.md`
- `reports/company_coverage_audit_latest.md`
- `reports/regime_hypothesis_alignment_latest.md`
- `reports/stale_hypotheses_latest.md`

## 大事な判断で必ずPro会議を通す

以下の時は、必ず `reports/stock_pro_committee_latest.md` を見る。

- 新規銘柄を追加するとき
- 保留/証拠不足から調査候補へ上げるとき
- 決算・株主総会・配当・中計・自社株買いなど重要IRイベント前後
- 通知候補にする/重要度を上げるとき
- 社会情勢・テーマ認識を変えるとき

見るべきもの:

- 合意点
- 対立点
- 足りない情報
- 上がらない理由
- 下がる理由
- 次に集める情報
- 最終ラベル

## 検出ルール（Sランク）

1. IPO後の売り圧力終了
2. スピンオフ / 分社化 / 親会社売却の検出
3. 決算翌日の急落 + 長期テーマあり
4. 高値から -15〜30% 下落 + 業績悪化ではない
5. 大型開示の要約レポート生成

## スコアリング

| カテゴリ | 最大点 |
|--------|--------|
| 構造イベント | 30 |
| 需給改善 | 25 |
| 割安感 | 15 |
| テーマ性 | 15 |
| 業績安全性 | 10 |
| AI評価 | 5 |

**通知レベル**

- 🚨 85点以上: 即通知
- 📋 70〜84点: 朝まとめ
- 📝 50〜69点: ログ保存のみ
- ➖ 49点以下: 対象外

## Pro運用向けに見る情報

`daily` レポートでは、単なるスコアだけでなく以下も確認する。

### 市場文脈

| 項目 | 意味 |
|------|------|
| 5日/20日/60日リターン | 短期・中期の値動き |
| TOPIX比20日 | 市場全体より強いか |
| 20日平均売買代金 | 流動性リスク |
| 20日ボラティリティ | 値動きの荒さ |

### 財務品質

| 項目 | 意味 |
|------|------|
| 売上前年比 | 成長しているか |
| 営業利益前年比 | 利益が伸びているか |
| 営業利益率 | 収益性 |
| 営業利益率前年差 | 収益性の改善/悪化 |
| 会社予想進捗率 | 予想に対する進み具合 |
| 下方修正検出 | 業績リスク |

### バックテスト

`pnpm backtest` では以下を出力する。

- 全体成績
- スコア帯別成績
- ルール別成績
- 優先度別成績
- 30日/90日/180日の平均・中央値・勝率

## セットアップ

```bash
pnpm install
cp .env.example .env
```

`.env` に必要な値を入れる。

```env
JQUANTS_EMAIL=
JQUANTS_PASSWORD=
LINE_CHANNEL_TOKEN=
LINE_USER_ID=
```

## 使い方

```bash
# 毎朝実行
pnpm daily

# Pro運用完全版
bash scripts/run-daily-complete.sh

# Pro知識ブラッシュアップ込み完全版
bash scripts/run-daily-complete-with-refresh.sh

# モックで動作確認
pnpm daily:mock

# バックテスト
pnpm backtest

# 型チェック
pnpm typecheck

# 軽量テスト
node --import tsx/esm tests/score.test.ts
node --import tsx/esm tests/validation.test.ts
node --import tsx/esm tests/analysis.test.ts
```

`reports/latest.md` にサマリーが出力される。  
`reports/<コード>_<日付>.md` に個別レポートが出力される。  
`reports/backtest_<日付>.md` にバックテスト結果が出力される。

## 品質チェック

GitHub Actions で以下を自動実行する。

- `pnpm typecheck`
- `tests/score.test.ts`
- `tests/validation.test.ts`
- `tests/analysis.test.ts`
- Pro運用補助レポート群
- Pro知識ブラッシュアップレポート
- Pro会議レポート

手元でまとめて確認する場合:

```bash
pnpm typecheck
node --import tsx/esm tests/score.test.ts
node --import tsx/esm tests/validation.test.ts
node --import tsx/esm tests/analysis.test.ts
```

## 安全運用ルール

- 本番実行では J-Quants 未設定時にモックへ自動フォールバックしない。
- `--mock` または `USE_MOCK=true` のときだけモックデータを使う。
- `dataQuality` が `ok` ではない候補は、即通知/朝まとめからログ扱いへ落とす。
- 欠損した財務データは `0` として加点しない。
- 日付は `Asia/Tokyo` 基準で処理する。
- `earnings_drop` は決算開示日の前後営業日ベースで判定する。
- TOPIX比・流動性・ボラティリティ・財務品質を確認してから調査判断する。
- 総会・決算・配当・資本政策を見ずに個別銘柄を強く判断しない。
- Pro会議で証拠不足が出た銘柄は、ラベルを上げない。

## 銘柄の登録

`config/watchlist.yml` を編集する。

```yaml
symbols:
  - code: "9999"
    name: "銘柄名"
    market: "TSE"
    status: "research"   # candidate / research / watch / active / ignore / expired
    priority: "A"        # S / A / B / C
    tags:
      - semiconductor
    rules:
      - ipo_selling_pressure_done
      - healthy_pullback
    listedAt: "2026-01-15" # IPO銘柄の場合は上場日を入れる
```

`watchlist.yml` は `pnpm daily` 実行時に検証される。  
重複コード、空の `rules` / `tags`、不正な `listedAt` 形式はエラーになる。

### 銘柄仮説・社会情勢・Pro考察の登録

銘柄を深く考察する場合は、watchlist だけでなく以下も確認する。

- `config/company-hypotheses.yml`
- `config/company-network.yml`
- `config/company-ir-events.yml`
- `config/company-onboarding-policy.yml`
- `config/stock-pro-quality-gate.yml`
- `config/stock-pro-consultation-policy.yml`
- `config/pro-knowledge-refresh.yml`

サンプル登録プレビュー:

```bash
pnpm register:company:preview
```

サンリオサンプルを登録ログへ書き込み:

```bash
pnpm register:company:sanrio
```

## データ取得

| データ | 取得元 | 状態 |
|-------|--------|------|
| 株価・出来高 | J-Quants Free | 実装済み |
| 財務情報 | J-Quants Free | 実装済み |
| 市場文脈 | J-Quants日足から計算 | 実装済み |
| 財務品質 | J-Quants財務から計算 | 実装済み |
| 有価証券報告書 | EDINET | 実装済み |
| IPO情報 | JPX新規上場ページ | 実装済み |
| 開示情報 | JPX適時開示ページ / EDINET | 実装済み |
| Pro知識更新キュー | config/pro-knowledge-refresh.yml | 実装済み |
| Pro会議レポート | config/stock-pro-agents.yml + 各種DB | 実装済み |

## ディレクトリ構成

```
alpha-pon/
├── config/
│   ├── watchlist.yml                   # 監視銘柄
│   ├── rules.yml                       # スコアリング設定
│   ├── themes.yml                      # テーマ定義
│   ├── company-hypotheses.yml          # 銘柄仮説
│   ├── company-network.yml             # 競合・関連会社・better peer risk
│   ├── company-ir-events.yml           # 総会・決算・配当・資本政策
│   ├── stock-pro-agents.yml            # Proエージェント定義
│   ├── stock-pro-quality-gate.yml      # Pro品質ゲート
│   └── pro-knowledge-refresh.yml       # Pro知識ブラッシュアップ
├── data/                               # 取得データ（gitignore）
├── docs/
│   └── operation-playbook.md           # 運用プレイブック
├── reports/                            # 生成レポート（gitignore）
├── tests/                              # 軽量テスト
└── src/
    ├── analysis/                       # 市場文脈・財務品質分析
    ├── daily.ts                        # メインスクリプト
    ├── score/                          # スコアリング関数
    ├── report.ts                       # Markdown生成
    ├── validation.ts                   # watchlist検証
    ├── date.ts                         # JST日付ヘルパー
    ├── config.ts                       # 設定読み込み
    └── types.ts                        # 型定義
```

## 注意

**このツールは買い推奨ツールではありません。**  
投資判断は必ず自己責任で行ってください。
