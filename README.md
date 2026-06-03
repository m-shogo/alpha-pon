# alpha-pon

長期投資向けの調査候補・監視候補を見つけ、仮説検証するアプリ。

> 自動売買しない。株価予想しない。買い推奨しない。  
> **調査候補を見逃さず、見落とし・上がらない理由・下がる理由を減らすためのツール。**

## 目的

毎日株価や開示を見に行かなくても、条件を満たした銘柄を調査候補として記録・通知してくれる。  
ただし、**買うかどうかは必ず自分で判断する。**

alpha-pon は、単に「良さそうな銘柄」を出すのではなく、以下を重視する。

- 公式IR・決算・株主総会・配当・資本政策を確認する
- 良い会社と良い投資タイミングを分ける
- 上がらない理由・下がる理由を先に考える
- 複数の株Pro視点で相談する
- 先生同士の意見の食い違いを平均点に潰さず、慎重意見を残す
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
| `private` | 個人利用 | 調査候補・追加調査候補など、自分用の実用表現 |

未設定時は `portfolio` です。

## 推奨実行コマンド

通常のdaily:

```bash
pnpm daily
```

Pro委員会・UIデータだけ検証したい時:

```bash
pnpm verify:pro
```

`verify:pro` は以下をまとめて実行する。

```text
pro:all → ui:data → pro-disagreement test → generated data shape test
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

以下の時は、必ず `reports/stock_pro_committee_latest.md` と `reports/stock_pro_committee_latest.json` を見る。

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
- 先生同士の食い違い `consensus / disagreements`
- 元ラベルと安全側に倒した後のラベル `originalFinalLabel / finalLabel`
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

- 🚨 85点以上: 優先通知
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
JQUANTS_V2_DATA_DELAY_DAYS=84
JQUANTS_V2_REQUEST_INTERVAL_MS=3000
JQUANTS_V2_RETRY_ATTEMPTS=5
ANALOGY_REVIEW_MAX_PER_RUN=12
UNIVERSE_SCAN_MAX_PER_RUN=8
UNIVERSE_SCAN_OFFSET=0
JQUANTS_EMAIL=
JQUANTS_PASSWORD=
LINE_CHANNEL_TOKEN=
LINE_USER_ID=
```

## 使い方
