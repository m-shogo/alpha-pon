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
