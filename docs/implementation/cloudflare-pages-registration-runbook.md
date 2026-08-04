# Alpha Pon Cloudflare Pages registration runbook

Status: `DEPRECATED`
Updated: 2026-08-04 JST

この手順は使用しない。

Alpha Ponの重要イベントカレンダーは、Cloudflare Pages / Pages Functionsではなく、**Cloudflare Workers Static Assets + Worker script + D1**へ移行した。

現在の正本手順:

```text
docs/implementation/cloudflare-workers-static-assets-runbook.md
```

Cloudflare Dashboardでは新しいPages projectを作成しない。既に作成済みのWorker `alpha-pon`を使用し、repo rootの`wrangler.jsonc`からデプロイする。

現在のCloudflare Builds設定:

| 項目 | 値 |
|---|---|
| Production branch | `main` |
| Root directory | `/` |
| Build command | `bash scripts/build-cloudflare-workers.sh` |
| Deploy command | `npx wrangler deploy` |
| Non-production deploy command | `npx wrangler versions upload` |

旧Pages設計の履歴はGit historyおよび`market-event-foundation-v1-status.md`に残っている。rollbackや比較が必要な場合だけ参照し、外部登録手順として再利用しない。
