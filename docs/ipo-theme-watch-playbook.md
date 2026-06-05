# IPOテーマ監視プレイブック

大型IPO、AI、宇宙/衛星通信、メモリ/ストレージ関連の報道を、調査テーマとして扱うための運用メモです。売買推奨ではありません。

## 目的

- OpenAI / Anthropic / SpaceX / Starlink 級の上場報道を、公式情報・価格シグナル・決算確認に分解する
- 関連日本株を、テーマ名だけで評価しない
- 上場前、上場週、初回決算、ロックアップ解除、過熱後の調整、実需確認を分ける
- キオクシアホールディングスのような AIストレージ/NAND/SSD/eSSD 文脈も、価格過熱と実需を分けて見る

## 実行

```bash
pnpm theme:ipo
pnpm ui:data
```

出力:

- `reports/ipo_theme_watch_latest.md`
- `reports/ipo_theme_watch_latest.json`
- `apps/web/public/generated/alpha-pon-data.json` の `ipoThemeWatch`

## 見る順番

1. `defaultAction`
2. `neverTreatAs`
3. `phases`
4. `rules[].evidenceNeeded`
5. `rules[].touchAvoidReasons`
6. `outcomeStats`

## フェーズ

- `pre_ipo`: 上場前報道。公式届出と報道の差を見る
- `ipo_week`: 上場週。価格発見と出来高集中を見る
- `first_earnings`: 上場後初回決算。物語と実績の差を見る
- `lockup_expiry`: ロックアップ解除。需給イベントとして見る
- `post_hype_drawdown`: 過熱後の調整。押し目か仮説崩れかを分ける
- `fundamental_confirmation`: 実需確認。受注、粗利率、市況、設備投資を確認する

## 関連テーマ

- AI大型上場監視: OpenAI / Anthropic
- 宇宙・衛星通信上場監視: SpaceX / Starlink
- AIストレージ・メモリ市況: NAND / SSD / eSSD

## 日本株への波及確認

- キオクシアホールディングス: NAND / SSD / eSSD / AI推論ストレージ
- 東京エレクトロン: 半導体製造装置
- アドバンテスト: 半導体検査
- フジクラ: 光通信・データセンター配線
- 住友電気工業: 光通信・電力網
- 三菱重工業: 宇宙・防衛・打上げ関連
- ispace: 宇宙テーマ上場企業

## 答え合わせ

`ipoThemeWatch.outcomeStats` で、テーマ・フェーズ・関連企業ごとの結果を後日確認します。

- `sampleSize`
- `sampleTooSmall`
- `hitRate`
- `avgReturn1w`
- `avgReturn1m`
- `avgTopixRelative1m`

`sampleTooSmall` が true の行は、判断材料ではなく、今後の蓄積待ちとして扱います。
