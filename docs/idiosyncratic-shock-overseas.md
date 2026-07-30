# 海外株の企業固有ショック監視

## 結論

海外株も対象にする。ただし、日本株と同じ価格判定をそのまま使わない。

共通化するもの:
- 事件カテゴリ
- actor type
- 10項目score
- investigationStatus
- accounting / organization / separability のhard gate
- 過去類似事例距離

市場別に分離するもの:
- 株価データprovider
- benchmark
- 取引日カレンダー
- ticker表記
- 規制当局・取引所の一次情報源

## 優先順位

1. JP — 現在の本番。J-Quants + TOPIX。
2. US — 海外の最優先。既存の過去事例が厚く、比較価値が高い。
3. UK / EUROPE — BP等の過去事例を比較に利用。価格provider導入後にlive通知。
4. AU / CA — 過去類似には使うがlive価格判定は後段。
5. OTHER — benchmarkと一次情報経路が確定するまで通知しない。

## benchmark

- JP: TOPIX
- US: S&P 500
- UK: FTSE 100
- EUROPE: STOXX Europe 600
- AU: S&P/ASX 200
- CA: S&P/TSX Composite

企業固有ショックは、現地通貨建て株価と同じ市場のbenchmarkで比較する。

例: 米国株のドル建て株価が-8%でもS&P 500が-7%なら、企業固有ショックとしては弱い。逆にS&P 500が-1%の中で対象株だけ-10%なら、relative shockは強い。

為替はこのレイヤーのshock判定には入れない。JPY換算損益は投資家側の別レイヤーで扱う。

## live通知の条件

海外も日本と同じ10項目score / evidence / investigation hard gateを使う。

ただし価格providerが未設定の市場は、

- news discovery: 可
- 一次情報調査: 可
- score: 可
- 過去類似比較: 可
- LINE通知: 不可

とする。価格を推測して通知しない。

## USを次に実装する理由

既存DBにはMcDonald's、Intel、Texas Instruments、Lockheed Martin、Best Buy、Booking、HP、Norfolk Southern、Kohl's、Wynn Resorts、Wells Fargo、Activision Blizzard、Papa John's、Keurig Dr Pepper、WWE、eBay等、米国の成功寄り/失敗寄りの比較例がすでにある。

そのため、USは新しいscore体系を作る必要はなく、主な不足は次の3点。

1. 信頼できる日次価格provider
2. S&P 500 benchmarkの同日比較
3. SEC / company IR / exchange等の一次情報取得経路

## データ漏洩防止

海外株を追加しても、未来情報を過去scoreへ逆流させない。

- score = decision checkpoint時点
- outcome = その後の1w/1m/3m/1y
- benchmark relative = 同じ市場・同じ期間
- 後から判明した会計不正等はoutcome/reviewへ記録し、当時scoreを書き換える場合はre-score理由を明記

## 現在の安全状態

`src/idiosyncratic-shock-market.ts` に市場別benchmark/readinessを定義した。

現時点ではJPのみ `autoPriceEnabled=true`。US/UK/EUROPE/AU/CAは価格provider未設定なのでfail-closed。

`pnpm report:shock-markets` で市場別の過去事例数・active件数・通知readinessを確認できるようにする。
