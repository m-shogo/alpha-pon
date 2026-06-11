# 世界ニュース影響仮説レビュー

世界ニュースを銘柄別の影響仮説として保存し、後日 outcome で検証するための運用メモです。
この機能は投資助言ではなく、一次情報・価格データ・反証条件をそろえるための研究ログです。

## 生成物

- `data/world_event_impacts.jsonl`: `--write` 実行時に追記される蓄積ログ
- `data/world_event_impacts_latest.json`: Web UI と監査が読む最新スナップショット
- `reports/world-impact-review.json`: 変換結果のレポート
- `reports/world-impact-review.md`: 人間が読むレビュー
- `reports/world-impact-audit.json`: 品質監査結果
- `reports/world-impact-audit.md`: 人間が読む監査サマリー

## 実行

```bash
pnpm review:world-impact
pnpm audit:world-impact
pnpm ui:data
pnpm report:ops
```

`pnpm review:world-impact` は既定で dry-run です。`data/world_event_impacts_latest.json` とレポートは更新しますが、JSONL には追記しません。

蓄積ログへ追記する場合だけ、以下を使います。

```bash
pnpm review:world-impact -- --write
```

## 判定ルール

- `dataAvailability !== ok` は未評価として扱う
- `priceDataPending` は価格データ提供待ちとして情報扱いにする
- `result=null` は未評価として扱う
- expected/actual が `unknown` 同士なら hit 扱いにしない
- TOPIX 比較不能な outcome は比較不能として残す
- 反証条件と影響メカニズムが空なら監査で確認対象にする
- 重複 `reviewKey` は監査で緊急扱いにする

## 画面

- `/stocks/[code]`: 銘柄に紐づく世界ニュース影響仮説を考察履歴として表示する
- `/ops`: `world-impact-audit` の件数、未評価、価格データ提供待ち、反証条件未記録を表示する

空データや未生成ファイルがあっても Web UI は落とさず、未記録・未評価・データ不足として表示します。
