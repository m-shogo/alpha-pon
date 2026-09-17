# Holdout Vault

**このディレクトリの封印範囲は、研究中に参照してはいけません。**

- 封印定義: [vault.manifest.json](vault.manifest.json)
- 開封記録: `access_log.jsonl`（Append Only。開封したら消せません）

## ルール

1. `idea` / `research` / `shadow` の段階では、封印期間のデータを一切見ない。
2. Production Gate の判定時にだけ開封する（`purpose: production_gate` 以外は不可）。
3. 開封は 1 つの Edge につき原則 1 回。何度も開けて通るまで試すのは
   Holdout の意味を消す行為であり、`access_log.jsonl` に全部残る。
4. 開封結果が `fail` なら、その Edge は Production に上げられない。
   仮説を作り直す場合は**新しい Edge**として登録する（既存 Edge の hypothesis は immutable）。

CI は「Edge の研究期間と Holdout 期間が重なっていないこと」と
「`holdoutPass: pass` に対応する開封記録があること」を検証します。

## 開け方（`research:holdout:open`）

```
pnpm research:holdout:open --bundle=<bundle> --prereg=<事前登録> \
  --from=<確認期間の開始日> --trading-days=<営業日数> --min-t=<閾値> --min-clusters=<最小クラスタ> --actor=<名前>
```

- 引数だけなら**計画の表示**（価格は読まない）。`--execute` で1回だけ実行し、`access_log.jsonl` に追記する
- 開けない条件: 事前登録が未コミット・変更中・条件（bundle・開始日・営業日数）を書いていない／
  この Edge が開封済み／確認期間の営業日が足りない／取り込みに穴がある／封印の窓と重ならない
- 確認期間の長さは**取り込まれた営業日の数**で決める。「クラスタが N 以上」のように
  価格から数えると、開ける前に封印を覗くことになる
- bundle は2種類: backtest（合格は「補正後 t ≥ 閾値 かつ Net 平均 > 0」）と
  開示イベントスタディ（`kind: disclosure_event_study`。主要 horizon の |t| ≥ 閾値で「反応あり」。コスト前）
- どちらもクラスタが最小数に満たなければ標本不足として不合格で記録する
- 引数の閾値・最小クラスタが事前登録の本文と一致しなければ開けない（`最小クラスタ N` と書く）
