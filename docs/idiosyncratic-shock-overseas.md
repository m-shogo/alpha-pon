# 海外株の企業固有ショック監視

## 結論

海外株も対象にする。ただし、日本株の価格判定をそのまま流用しない。

共通化するもの:
- 事件カテゴリ
- actor type
- 10項目score
- evidenceStatus / investigationStatus
- accounting / organization / separability のhard gate
- 過去類似事例距離

市場別に分離するもの:
- 株価データprovider
- benchmark
- 取引日カレンダー
- ticker / symbol表記
- 規制当局・取引所の一次情報源

## 優先順位

1. JP — J-Quants + TOPIX。
2. US — Twelve Data + S&P 500 proxy + SEC EDGAR。海外の最優先。
3. UK / EUROPE — BP等の過去事例を比較に利用。price provider導入後にlive通知。
4. AU / CA — 過去類似には使うがlive価格判定は後段。
5. OTHER — benchmarkと一次情報経路が確定するまで通知しない。

## benchmark

- JP: TOPIX（既定コード `1306`）
- US: S&P 500。実装では同一価格providerで取得できる `SPY` を既定proxyにする
- UK: FTSE 100
- EUROPE: STOXX Europe 600
- AU: S&P/ASX 200
- CA: S&P/TSX Composite

企業固有ショックは、現地通貨建て株価と同じ市場のbenchmarkで比較する。

例: 米国株のドル建て株価が-8%でもSPYが-7%なら、企業固有ショックとしては弱い。逆にSPYが-1%の中で対象株だけ-10%なら、relative shockは強い。

為替はこのレイヤーのshock判定には入れない。JPY換算損益は投資家側の別レイヤーで扱う。

## US price provider

`src/fetcher/twelve-data.ts` を使用する。

環境変数:

```text
TWELVE_DATA_API_KEY=...
US_MARKET_BENCHMARK_SYMBOL=SPY
```

日足 `time_series` を使い、split-adjusted価格で対象株とSPYを同じevent windowで比較する。

API keyが未設定なら `isTwelveDataConfigured() = false` となり、自動価格判定を行わない。価格を推測して通知しない。

## SEC一次情報

US候補では会社IRに加え、SEC EDGARを一次情報経路に使う。

`src/fetcher/sec-edgar.ts`:
- `company_tickers.json` でsymbol → CIKを解決
- `data.sec.gov/submissions/CIK##########.json` から提出履歴を取得
- 8-K / 8-K/A / 6-K / 6-K/A / 10-Q / 10-K / 20-F / 40-F等をreview対象にする

環境変数:

```text
SEC_USER_AGENT=alpha-pon contact@example.com
SHOCK_SEC_SYMBOLS=MCD,INTC
SHOCK_SEC_LOOKBACK_DAYS=120
```

SECの公開データAPI自体にAPI keyは不要だが、fair-access policyに従いUser-Agentを宣言する。実装はSECの上限より低いrequest intervalを既定値にする。

実行:

```text
pnpm review:shock-sec
```

active US候補のsymbolと `SHOCK_SEC_SYMBOLS` を対象に、最近の主要提出書類を `reports/idiosyncratic_shock_sec_review_latest.*` へ出す。

提出書類が存在するだけではscoreを上げない。内容を確認し、以下を解決してからactive昇格/再採点する。

- 辞任・解任理由は個人行動か、本業/財務問題か
- restatement / internal control / unrecorded payment等の会計論点
- DOJ / SEC / FTC等の規制・捜査への波及
- investigation scopeが確定したか
- guidance / operations / financial reportingへの影響

## live通知の条件

海外も日本と同じscore / evidence / investigation hard gateを使う。

さらに、

1. event後20日以内の絶対下落が `<= -5%`
2. 現地benchmark比のrelative shockが `<= -3%`
3. `priceState=stabilized_after_drop`

を要求する。

provider未実装またはAPI設定なしなら、

- news discovery: 可
- 一次情報調査: 可
- score: 可
- 過去類似比較: 可
- LINE通知: 不可

とする。

手動overrideも可能だが、`priceStateOverride`、`shockDrawdownPctOverride`、`relativeShockDrawdownPctOverride` をすべて確認する。相対下落が欠ければfail-closed。

## US候補の形式

```yaml
- id: example-us-shock
  market: US
  symbol: MCD
  company: McDonald's
  detectedAt: "2026-07-30"
  category: personal_behavior
  actorType: ceo
  evidenceStatus: confirmed
  investigationStatus: substantially_complete
  # ...10項目score / sources
```

`market: US` を明示する。英字tickerだけを見てUSと自動決め打ちしない。

## USを優先する理由

既存DBにはMcDonald's、Intel、Texas Instruments、Lockheed Martin、Best Buy、Booking、HP、Norfolk Southern、Kohl's、Wynn Resorts、Wells Fargo、Activision Blizzard、Papa John's、Keurig Dr Pepper、WWE、eBay等、米国の成功寄り/失敗寄りの比較例がすでにある。

したがってUSではscore体系を作り直さず、同じ構造評価を使って価格・一次情報だけ市場対応する。

## データ漏洩防止

海外株を追加しても、未来情報を過去scoreへ逆流させない。

- score = decision checkpoint時点
- outcome = その後の1w/1m/3m/1y
- benchmark relative = 同じ市場・同じ期間
- 後から判明した会計不正等はoutcome/reviewへ記録
- 過去scoreを再評価する場合はre-score理由を明記

## 現在の安全状態

- JP: J-Quants provider実装済み。設定済みのときだけ価格評価
- US: Twelve Data provider実装済み。`TWELVE_DATA_API_KEY` 設定済みのときだけ価格評価
- US primary evidence: SEC EDGAR client / review report実装済み。`SEC_USER_AGENT` 未設定なら取得しない
- UK / EUROPE / AU / CA: 過去類似のみ。price provider未実装なのでlive通知しない

`pnpm report:shock-markets` で市場別の過去事例数・active件数・provider実装/設定・通知readinessを確認する。
