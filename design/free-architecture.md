# 無料版アーキテクチャ設計 (v0.1)

## データソース構成

```yaml
株価:
  J-Quants Free（遅延あり）

IPO:
  JPX新規上場ページ

開示:
  JPX適時開示ページの直近分
  既存TDnetアプリの通知も併用

有報:
  EDINET API

企業IR:
  watchlist銘柄だけ

AI要約:
  自動APIなし
  reports/*.md をChatGPT/Codexに手動で投げる
```

## シグナル別 無料取得可否

### 1. IPO後の売り圧力終了

| 情報 | 無料取得 |
|------|---------|
| 上場日 | JPX新規上場 |
| 初日出来高 | J-Quants Free（遅延あり） |
| 現在出来高 | 無料サイトスクレイピング候補 |
| 直近10日安値 | 無料サイトスクレイピング候補 |
| 過去検証 | J-Quants Free で OK |

> リアルタイム運用したくなったら J-Quants Light が必要。

### 2. スピンオフ / 分社化 / 親会社売却

| 情報 | 無料取得 |
|------|---------|
| TDnet タイトル | JPX適時開示ページ |
| 直近 PDF | JPX適時開示ページ |
| 過去 PDF | 上場会社検索 / 企業 IR ページ |
| 大株主 | EDINET |
| 親会社関係 | EDINET |

> 無料でもかなりいける。

### 3. 決算翌日の急落 + 長期テーマあり

| 情報 | 無料取得 |
|------|---------|
| 決算日 | 無料サイト候補（不安定） |
| 翌営業日株価 | 無料サイト候補 / J-Quants 遅延 |
| 決算短信 | TDnet 直近分 / 企業 IR |
| 下方修正有無 | TDnet タイトル検出 |
| テーマタグ | 自前辞書 |

> 当日性は弱い。

### 4. 高値から -15〜30% 下落 + 業績悪化ではない

| 情報 | 無料取得 |
|------|---------|
| 直近高値 | 株価データが必要 |
| 現在価格 | 無料サイト候補 |
| 売上/利益 | EDINET / J-Quants Free |
| 下方修正 | TDnet タイトル / 企業 IR |

> J-Quants Light があるとかなり楽になる。

## スクレイピング ルール

```yaml
OK:
  - watchlist 20〜50 銘柄を 1日1回
  - キャッシュする
  - robots.txt や利用規約を確認する
  - エラー時は止める
  - 再配布しない

NG:
  - 全上場銘柄を毎分クロール
  - PDF を大量保存して再配布
  - 有料サービスの代替として大量取得
  - ログイン必要なサイトを自動操作
```

## 型設計（差し替え可能なプロバイダー）

### 株価

```typescript
type PriceDataSource = "jquants-free" | "jquants-light" | "scraping" | "manual";

type PriceBar = {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: PriceDataSource;
};

interface PriceProvider {
  getDailyPrices(code: string): Promise<PriceBar[]>;
}
```

最初は少数スクレイピング → 後で J-Quants Light に差し替えるだけ。

### 開示

```typescript
type DisclosureSource =
  | "tdnet-free-page"
  | "company-ir"
  | "edinet"
  | "jquants-tdnet-addon"
  | "manual";

type Disclosure = {
  code?: string;
  companyName: string;
  title: string;
  publishedAt: string;
  url: string;
  source: DisclosureSource;
  hasPdf: boolean;
};
```

有料 TDnet アドオンを後から追加しても作り直し不要。

## 無料版の役割

```yaml
やらない:
  - リアルタイム売買判断

やる:
  - 長期投資の候補発見
  - 大きな構造イベント検出
  - 本命ウォッチリストの変化検出
  - 毎朝の調査メモ生成
```

**コンセプト: 「今日買え」通知ではなく、「調査候補を見逃さない」通知**

## 優先実装順

### 無料で作る

1. EDINET API
2. JPX 新規上場ページ
3. JPX 適時開示ページ
4. 企業 IR ページ（watchlist 限定）
5. J-Quants Free

### 後で有料検討

1. J-Quants Light
2. TDnet 文書アドオン（月 11,000 円、Light 以上向け・過去 5 年分 + 当日）
3. Claude API 自動要約

> 課金するならまず J-Quants Light。TDnet 文書アドオンは MVP には高い。
