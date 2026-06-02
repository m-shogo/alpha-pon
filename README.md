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

## Next.js Web UI

`design/` は HTML プロトタイプ（サンプル）です。実アプリの UI は `apps/web/` です。

```bash
# データ生成（Next.js 用 JSON のみ出力）
pnpm ui:data

# 開発サーバー起動
pnpm web:dev          # → http://localhost:3000

# 本番ビルド
pnpm web:prepare      # ui:data + web:build

# 全チェック（CLI + Web）
pnpm check:all
```

画面構成:

| パス | 内容 |
|---|---|
| `/` | ホーム（注目候補・Pro司令塔） |
| `/stocks` | 銘柄一覧（スコア順） |
| `/stocks/[code]` | 銘柄詳細（仮説・スクリーニング・検証） |
| `/alerts` | 監視候補（未登録銘柄の自動スクリーニング） |
| `/world` | 世界情勢と監視テーマ |
| `/hypotheses` | 仮説一覧 |
| `/outcomes` | 当たり外れ検証 |
| `/reports` | Pro レポート |
| `/roadmap` | 100%完成までの readiness / 残ロードマップ |

> このWeb UIは買い推奨ではありません。
> 調査候補・監視候補・仮説検証を見やすくするための画面です。

### 表示モード

`APP_MODE` で文言を切り替えます。

| mode | 用途 | 表示方針 |
|---|---|---|
| `portfolio` | 外部公開・転職ポートフォリオ | 監視候補・仮説検証・反証待ちなど、投資助言に見えない表現 |
| `private` | 個人利用 | 買い候補・買い足し候補など、自分用の実用表現 |

未設定時は `portfolio` です。

## 推奨実行コマンド

通常のdaily:

```bash
pnpm daily
```

Pro運用の完全版（ユニバーススキャン・仮説・Next.js JSON 更新を含む）:

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
JQUANTS_API_KEY=
JQUANTS_EMAIL=
JQUANTS_PASSWORD=
LINE_CHANNEL_TOKEN=
LINE_USER_ID=
```

## 使い方

```bash
# 毎朝実行（正式入口）
bash scripts/run-daily-complete.sh

# Pro知識ブラッシュアップ込み完全版
bash scripts/run-daily-complete-with-refresh.sh

# daily のみ（J-Quants不要の軽量版）
pnpm daily

# pnpm コマンドで完全版を手動実行したい場合
pnpm daily:full

# モックで動作確認（J-Quants 未設定の開発環境）
pnpm daily:mock

# 100%完成へ向けた残タスク監査
pnpm readiness:audit

# ユニバーススキャンのみモックで確認
pnpm scan:universe:mock

# バックテスト
pnpm backtest

# 型チェック
pnpm typecheck

# 軽量テスト
node --import tsx/esm tests/score.test.ts
node --import tsx/esm tests/validation.test.ts
node --import tsx/esm tests/analysis.test.ts
```

> **入口の整理**: 毎朝の自動実行は `run-daily-complete.sh`（launchd から起動）が正式。
> `daily:full` は、世界情勢スキャン、TDnet dry-run、有報スキャン、daily、ユニバーススキャン、会社ルール生成、仮説生成、outcomeレビュー、company memory、readiness、Web JSON生成までをまとめて呼ぶ手動版。
> J-Quants が未設定の場合、`scan:universe` は local mock JSON を使います。画面では MOCK と明示され、実データとして扱いません。
> J-Quants が未設定でも、`pnpm daily` は TDnet/EDINET の一次情報レビューだけは score JSON に残します。
> `pnpm daily` / `pnpm daily:full` を価格・財務まで実データ運用にするには `.env` の `JQUANTS_API_KEY` が必要です。旧V1互換として `JQUANTS_EMAIL` / `JQUANTS_PASSWORD` も残しています。

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

## 完成ロードマップの見方

`pnpm readiness:audit` は、100%完成に近づけるための残タスクを自動監査します。

出力:

- `reports/readiness_latest.md`
- `reports/readiness_latest.json`
- `apps/web/public/generated/readiness.json`

Web UI では `/roadmap` で確認できます。

主な監査項目:

- J-Quants 実データ運用
- 毎朝 pipeline 監視
- 仮説 outcome の厚み
- 一次情報・危険開示連携
- company memory
- portfolio mode / README

現時点で 100% に近づける最大の残タスクは、J-Quants 資格情報を設定して `pnpm daily:full` を実データで継続実行し、mock / missing / stale を消すことです。

## 安全運用ルール

- J-Quants 未設定時の universe scan は mock と明示し、実データのように見せない。
- `--mock` または `USE_MOCK=true` のときは開発・検証用のモックデータを使う。
- `dataQuality` が `ok` ではない候補は、即通知/朝まとめからログ扱いへ落とす。
- 欠損した財務データは `0` として加点しない。
- 日付は `Asia/Tokyo` 基準で処理する。
- `earnings_drop` は決算開示日の前後営業日ベースで判定する。
- TOPIX比・流動性・ボラティリティ・財務品質を確認してから調査判断する。
- 総会・決算・配当・資本政策を見ずに個別銘柄を強く判断しない。
- Pro会議で証拠不足が出た銘柄は、ラベルを上げない。
- ホーム画面の Pipeline / Mock / Missing 警告が出ている日は、調査候補を増やすよりデータ確認を優先する。
- 個別銘柄ページでは、一次情報・危険開示・company memory の弱いルールを確認してから仮説を更新する。

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

## J-Quants セットアップ（実データ有効化）

J-Quants Free プランを使うと、`scan:universe` で 30 銘柄の実株価・財務データをスクリーニングできます。

1. [J-Quants](https://www.jpx.co.jp/markets/paid-info-equities/jquants/index.html) に登録（無料プランあり）
2. `.env` に API キーを設定:
   ```
   JQUANTS_API_KEY=your_api_key
   ```
3. 動作確認:
   ```bash
   pnpm scan:universe          # 実データでスクリーニング
   pnpm generate:company-rules # ルール生成
   pnpm ui:data                # Web JSON 更新
   ```

> J-Quants 未設定の場合は `pnpm scan:universe:mock` でモックデータ確認可。

## Vercel デプロイ

### 初回設定

1. [vercel.com](https://vercel.com) で alpha-pon リポジトリをインポート
2. **Root Directory**: リポジトリルート（`/`）のまま
3. **Build Command**: `pnpm web:build`（vercel.json で自動設定済み）
4. **Output Directory**: `apps/web/.next`（vercel.json で自動設定済み）
5. **環境変数** を Vercel ダッシュボードで設定:
   | 変数名 | 用途 | 必須 |
   |---|---|---|
   | `APP_MODE` | `portfolio`（公開用）または `private` | 推奨 |
   | `JQUANTS_API_KEY` | J-Quants V2 認証 | 実データ時のみ |
   | `JQUANTS_EMAIL` | J-Quants V1 互換認証 | 任意 |
   | `JQUANTS_PASSWORD` | J-Quants V1 互換認証 | 任意 |
   | `LINE_CHANNEL_TOKEN` | LINE 通知 | 任意 |
   | `LINE_USER_ID` | LINE 通知 | 任意 |

### 本番 JSON 更新方針

Vercel はビルド時に `apps/web/public/generated/*.json` を静的ファイルとして配信します。  
データを最新にするには以下のいずれかを選択してください。

**方針 A: commit & push で更新（現状の推奨）**
```bash
pnpm ui:scan:stocks    # scan + rules生成 + ui:data
git add apps/web/public/generated/
git commit -m "chore: update generated data"
git push               # Vercel が自動再デプロイ
```

**方針 B: Vercel Build Hook（毎朝自動）**
1. Vercel ダッシュボードで Build Hook URL を発行
2. `launchd` の daily スクリプト末尾に `curl -X POST <hook_url>` を追加
3. `run-daily-complete.sh` 完了後に Vercel が再ビルド・再デプロイ

**方針 C: 将来 API 化（DB/外部API）**
- `apps/web/lib/generated-data.ts` の `loadGeneratedData()` を DB/API に差し替え
- `apps/web/app/api/generated/` の Route Handler を本番 API に接続

## 注意

**このツールは買い推奨ツールではありません。**  
投資判断は必ず自己責任で行ってください。
