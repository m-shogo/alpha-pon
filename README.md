# alpha-pon

長期投資向けの調査候補・買い場候補自動発見アプリ。

> 自動売買しない。株価予想しない。買い推奨しない。  
> **調査候補を見逃さないためのツール。**

## 目的

毎日株価や開示を見に行かなくても、条件を満たした銘柄だけ通知してくれる。  
ただし、**買うかどうかは必ず自分で判断する。**

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

# モックで動作確認
pnpm daily:mock

# 型チェック
pnpm typecheck

# 軽量テスト
node --import tsx/esm tests/score.test.ts
node --import tsx/esm tests/validation.test.ts
```

`reports/latest.md` にサマリーが出力される。  
`reports/<コード>_<日付>.md` に個別レポートが出力される。

## 品質チェック

GitHub Actions で以下を自動実行する。

- `pnpm typecheck`
- `tests/score.test.ts`
- `tests/validation.test.ts`

手元でまとめて確認する場合:

```bash
pnpm typecheck
node --import tsx/esm tests/score.test.ts
node --import tsx/esm tests/validation.test.ts
```

## 安全運用ルール

- 本番実行では J-Quants 未設定時にモックへ自動フォールバックしない。
- `--mock` または `USE_MOCK=true` のときだけモックデータを使う。
- `dataQuality` が `ok` ではない候補は、即通知/朝まとめからログ扱いへ落とす。
- 欠損した財務データは `0` として加点しない。
- 日付は `Asia/Tokyo` 基準で処理する。
- `earnings_drop` は決算開示日の前後営業日ベースで判定する。

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

## データ取得

| データ | 取得元 | 状態 |
|-------|--------|------|
| 株価・出来高 | J-Quants Free | 実装済み |
| 財務情報 | J-Quants Free | 実装済み |
| 有価証券報告書 | EDINET | 実装済み |
| IPO情報 | JPX新規上場ページ | 実装済み |
| 開示情報 | JPX適時開示ページ / EDINET | 実装済み |

## ディレクトリ構成

```
alpha-pon/
├── config/
│   ├── watchlist.yml   # 監視銘柄
│   ├── rules.yml       # スコアリング設定
│   └── themes.yml      # テーマ定義
├── data/               # 取得データ（gitignore）
├── reports/            # 生成レポート（gitignore）
├── tests/              # 軽量テスト
└── src/
    ├── daily.ts        # メインスクリプト
    ├── score/          # スコアリング関数
    ├── report.ts       # Markdown生成
    ├── validation.ts   # watchlist検証
    ├── date.ts         # JST日付ヘルパー
    ├── config.ts       # 設定読み込み
    └── types.ts        # 型定義
```

## 注意

**このツールは買い推奨ツールではありません。**  
投資判断は必ず自己責任で行ってください。
