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
```

## 使い方

```bash
# 毎朝実行
pnpm daily

# 型チェック
pnpm typecheck
```

`reports/latest.md` にサマリーが出力される。  
`reports/<コード>_<日付>.md` に個別レポートが出力される。

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
```

## データ取得（v0.1は仮データ）

| データ | 取得元 | 状態 |
|-------|--------|------|
| 株価・出来高 | J-Quants Free | 未実装（仮データ） |
| 有価証券報告書 | EDINET | 未実装 |
| IPO情報 | JPX | 未実装 |
| 開示情報 | TDnet（手動） | 手動 |

## ディレクトリ構成

```
alpha-pon/
├── config/
│   ├── watchlist.yml   # 監視銘柄
│   ├── rules.yml       # スコアリング設定
│   └── themes.yml      # テーマ定義
├── data/               # 取得データ（gitignore）
├── reports/            # 生成レポート（gitignore）
└── src/
    ├── daily.ts        # メインスクリプト
    ├── score/          # スコアリング関数
    ├── report.ts       # Markdown生成
    ├── mock.ts         # 仮データ（v0.1）
    ├── config.ts       # 設定読み込み
    └── types.ts        # 型定義
```

## 注意

**このツールは買い推奨ツールではありません。**  
投資判断は必ず自己責任で行ってください。
