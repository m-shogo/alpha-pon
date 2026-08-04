# Alpha Pon Workers Static Assets deployment runbook

Status: `IMPLEMENTATION_IN_PROGRESS`
Updated: 2026-08-04 JST
Scope: Next.js static export、Worker API、D1、tokenized ICSを単一のCloudflare Workerへ配置する

## 0. 採用構成

```text
Cloudflare Worker: alpha-pon
├─ Static Assets: apps/web/out
├─ Worker entry: worker/index.ts
├─ Dynamic routes
│  ├─ /healthz
│  ├─ /api/*
│  └─ /calendar.ics
└─ D1 binding: DB（初回静的deploy後に追加）
```

Pages projectは新規作成しない。既存のWorker `alpha-pon`を利用する。
旧`functions/[[path]].ts`は移行中の互換実装として残し、Worker entryから呼び出す。

## 1. Cloudflare Builds設定

| 項目 | 値 |
|---|---|
| Repository | `m-shogo/alpha-pon` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `bash scripts/build-cloudflare-pages.sh` |
| Deploy command | `npx wrangler deploy` |
| Non-production deploy command | `npx wrangler versions upload` |

現在のbuild script名には`pages`が残るが、処理内容はNext.js static exportと成果物検証であり、Workers Static Assetsでも再利用できる。移行完了後に名称を整理する。

初回deployではD1 bindingとruntime secretをまだ追加しない。静的UIとgenerated snapshotを先に公開して、Worker/Assets routingを確認する。

## 2. 初回deployで確認するログ

build成功:

```text
cloudflare-pages-build: ok
Success: Build command completed
```

deployではrepo rootの`wrangler.jsonc`が検出され、次が認識されること。

```text
main: worker/index.ts
assets directory: apps/web/out
assets binding: ASSETS
```

以前の次のエラーが再発してはならない。

```text
application detection logic has been run in the root of a workspace
```

`wrangler.jsonc`が存在するため、自動framework検出ではなく明示設定が使用される。

## 3. 初回deploy後の確認

D1・variables未設定の段階:

- `/` が200
- `/calendar/` が200
- CSS/JS/iconが読み込める
- `/generated/alpha-pon-events.json` が200
- `/healthz` が200
- healthの`databaseBound`は`false`
- `/calendar.ics`は404
- `/api/market-events`は503または認証拒否

カレンダーUIはlive APIに失敗した場合、last-known-good snapshotへfallbackする。

## 4. D1作成とbinding

D1 database名:

```text
alpha-pon-market-events
```

WorkerのSettings > Bindingsで次を追加する。

```text
Binding type: D1 database
Variable name: DB
Database: alpha-pon-market-events
```

D1作成後、database IDを確認し、`wrangler.jsonc.example`を参考に正式な`d1_databases`設定をrepoへ追加する。実IDを追加する変更は専用commitで行い、対象Cloudflare account以外へ流用しない。

schemaとseedは最初にdry-runする。

```bash
bash scripts/bootstrap-cloudflare-d1.sh \
  --database alpha-pon-market-events \
  --keep-export
```

確認後にremoteへ適用する。

```bash
bash scripts/bootstrap-cloudflare-d1.sh \
  --database alpha-pon-market-events \
  --apply \
  --keep-export
```

## 5. Runtime variablesとsecret

WorkerのSettings > Variables and Secretsへ追加する。

Plain variables:

```text
OWNER_EMAIL=<Cloudflare Accessで許可する本人メール>
PUBLIC_ORIGIN=https://<workers.devまたはcustom domain>
```

Encrypted secret:

```text
CALENDAR_FEED_TOKEN=<32bytes以上のランダム値>
```

生成例:

```bash
openssl rand -hex 32
```

実tokenをGitHub、Issue、ログ、スクリーンショットへ保存しない。

Build variablesはruntime variablesとは別物である。OWNER_EMAIL等をBuild variablesだけに入れない。

## 6. Cloudflare Access

Worker hostname全体をdeny-by-defaultにし、本人メールだけAllowする。

例外として`/calendar.ics`だけ、よりspecificなAccess policyでBypassする。カレンダー購読クライアントはAccess loginを通過できないためである。

BypassしてもWorker側で`CALENDAR_FEED_TOKEN`を検証する。tokenなし・誤tokenは404を返す。

`/api/*`、`/healthz`、静的UI全体をBypassしない。

## 7. 完了確認

### Static Assets

- `/`
- `/calendar/`
- `/manifest.webmanifest`
- `/sw.js`
- `/_next/static/*`
- 存在しないpathはcustom 404
- `/calendar`から`/calendar/`へのcanonical redirect

### Worker routes

- `/healthz`: 200
- `/api/market-events`: Access認証済み本人のみ200
- `/api/calendar-feed-url`: tokenized URLを返す
- `/calendar.ics?token=...`: 200、`text/calendar`
- tokenなし・誤token: 404
- POST等GET以外: 405

### D1

- `source: cloudflare-d1`
- seed eventが存在
- unknown dateはICSから除外
- secretsやprivate raw本文をAPIへ返さない

## 8. Rollback

Workers Buildsの直前の成功Versionを保持する。

移行版に問題がある場合:

1. Cloudflare DashboardのDeploymentsで直前Versionへrollback
2. `main`を巻き戻さず、専用fix PRを作成
3. 静的snapshotが利用できることを確認
4. D1 schemaを破壊的に戻さない

旧Pages FunctionファイルはWorker parity確認が終わるまで削除しない。

## 9. 外部操作の境界

repo内で自動化してよい:

- Worker entry、config、tests、CI、docs
- Wrangler dry-run
- local D1 export/audit

ユーザー確認後だけ行う:

- Cloudflare本番deploy
- D1作成・binding
- Access変更
- runtime variable/secret登録
- custom domain変更
- 課金が発生する設定
