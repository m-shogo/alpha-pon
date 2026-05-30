# Proposal history 運用メモ

alpha-pon の改善提案は `reports/proposals_latest.json` / `reports/proposals_latest.md` に出ます。

`src/proposal-history-run.ts` は、この提案を履歴化して、同じ改善提案が複数回出ているかを検出するための下地です。

## 手動実行

```bash
node --import tsx/esm src/proposals.ts
node --import tsx/esm src/proposal-history-run.ts
```

生成物:

```txt
data/proposals_history.jsonl
reports/proposal_streaks_latest.json
```

## daily pipeline への接続位置

`run-daily.sh` では、以下の順番が安全です。

```txt
health:sources
↓
diagnose:rules
↓
proposals
↓
proposal-history
↓
memory:companies
```

追加する行:

```bash
run_step "proposal-history" "noncritical" node --import "tsx/esm" "$DIR/src/proposal-history-run.ts" || true
```

## 運用ルール

- Hold は履歴に保存しない
- S が3回以上出たら、放置中の重要改善候補として扱う
- A が3回以上出たら、次の改善候補に昇格する
- 履歴は自動でルールを変更しない
- 買い推奨ではなく、運用品質・検証品質の改善にだけ使う

## 目的

毎朝の改善提案を一回きりで流さず、同じ問題が続いていないかを見える化する。

例:

```txt
J-Quants / 株価 / ベンチマーク取得率を改善する
一次情報レビューの接続と取得エラーを確認する
弱いルール候補を手動レビューする
```

これらが何日も続くなら、単発ノイズではなく、設定・取得元・ルール設計の問題として扱う。
