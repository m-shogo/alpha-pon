# Alpha Pon Cloudflare Pages registration runbook

Status: `READY_PENDING_EXTERNAL_REGISTRATION`
Updated: 2026-08-03 JST
Scope: Alpha Ponの静的Next.js UI、Pages Functions、D1、tokenized ICSを無料Cloudflare構成へ接続する

## 0. この手順の境界

ここまでのコード・schema・UI・PWA・ICS・Functions・dry-run・CIはrepo内に実装済み。
この文書の作業だけはCloudflareアカウント上の外部状態を変更するため、登録・認証後に実行する。

この手順は次を行わない。

- 有料プラン契約
- 自前VPS作成
- R2作成
- Google OAuth作成
- Google Calendar API同期
- LINE/Web Pushの実送信
- 売買注文

初期カレンダーはtokenized ICS購読で成立するため、Google OAuthは不要。

---

## 1. 登録前のローカル合格条件

```bash
pnpm install --frozen-lockfile
bash scripts/build-cloudflare-pages.sh
```

最後に次が出ること。

```text
cloudflare-pages-build: ok
```

さらにreadiness監査を単独でも確認する。

```bash
node --import tsx/esm scripts/verify-cloudflare-calendar-readiness.ts
```

期待状態:

```text
READY_PENDING_CLOUDFLARE_REGISTRATION
```

失敗した場合、Cloudflare登録を先に進めない。

---

## 2. Cloudflare Pages project

Cloudflare DashboardでGitHub repository `m-shogo/alpha-pon`を接続する。

設定:

| 項目 | 値 |
|---|---|
| Project name | `alpha-pon` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `bash scripts/build-cloudflare-pages.sh` |
| Build output directory | `apps/web/out` |
| Node.js | 22 |
| pnpm | 9 |

最初のdeployはD1 bindingなしでも静的画面とSNAPSHOT fallbackが表示できる。
`/api/market-events`はD1接続まで利用不可でよい。

確認:

- `/`
- `/calendar/`
- `/generated/alpha-pon-events.json`
- `/generated/alpha-pon-events.ics`
- `/manifest.webmanifest`
- `/sw.js`

---

## 3. D1 database

Cloudflare DashboardまたはWranglerで、次のD1 databaseを1つ作る。

```text
alpha-pon-market-events
```

Pages projectのproductionとpreviewの両方へ、binding名 `DB` で接続する。

binding名はコードと一致させる。別名にしない。

### schemaと初期seed

最初はdry-runする。

```bash
bash scripts/bootstrap-cloudflare-d1.sh \
  --database alpha-pon-market-events \
  --keep-export
```

この段階ではCloudflareへ書き込まない。

CloudflareへのログインとD1作成を確認後、remoteへ適用する。

```bash
bash scripts/bootstrap-cloudflare-d1.sh \
  --database alpha-pon-market-events \
  --apply \
  --keep-export
```

このscriptは次だけ行う。

1. seedを一時SQLiteへ登録
2. audit
3. `INSERT OR IGNORE` bootstrap生成
4. `0001_market_event_foundation.sql`をremoteへ適用
5. bootstrapをremoteへ適用
6. remote件数をread-only確認

D1 database自体の作成や削除はしない。

---

## 4. Environment variables / secret

Pages projectへ次を設定する。

### Plain variables

```text
OWNER_EMAIL=<Cloudflare Accessで許可する本人メール>
PUBLIC_ORIGIN=https://<alpha-ponの公開hostname>
```

### Encrypted secret

```text
CALENDAR_FEED_TOKEN=<32bytes以上のランダム値>
```

生成例:

```bash
openssl rand -hex 32
```

このtokenをGitHub、wrangler.jsonc、スクリーンショット、Issue、ログへ記録しない。
紛失時は再生成して購読URLを更新する。

Pages projectへ変数・secretを追加した後、redeployする。

---

## 5. Cloudflare Access

Alpha Ponは個人用のためdeny-by-defaultにする。

### 5.1 application全体

Pages hostname全体へSelf-hosted Access applicationを作成し、`OWNER_EMAIL`の本人だけをAllowする。

確認:

- 未認証ブラウザではUIに入れない
- 認証済み本人だけUIと `/api/*` に入れる
- Pages Functions側でも `Cf-Access-Authenticated-User-Email` と `OWNER_EMAIL`を再照合する

### 5.2 calendar feedだけの例外

Apple/Google Calendarの購読クライアントはCloudflare Accessログイン画面を通過できない。
そのため、よりspecificなAccess application/policyとして次のpathだけBypassする。

```text
/calendar.ics
```

広いpathや`/api/*`をBypassしない。

`/calendar.ics`自体はPages Functionが`CALENDAR_FEED_TOKEN`を検証し、不一致時は404を返す。
URLは秘密情報として扱う。

---

## 6. 動作確認

### health

```text
/healthz
```

期待:

- `ok: true`
- `accessConfigured: true`
- `calendarFeedConfigured: true`
- `databaseBound: true`

### live API

認証済みブラウザで:

```text
/api/market-events
```

期待:

- `source: cloudflare-d1`
- seed eventが存在
- unknown dateはUIに出る
- secrets、objectKey、private raw本文は返らない

### UI

`/`:

- 次の重要イベントカードが`LIVE`

`/calendar/`:

- スマホで1列
- PCで2列
- 今日、7日以内、日程未確定、結果待ちに分類
- 一次情報、事前確認、通過後確認が読める
- 内部review checkpointが公式日程に見えない

### ICS

認証済みUIの「購読URLをコピー」からtokenized URLを取得する。

期待:

- exact/date/window eventだけ含む
- unknown dateを含まない
- eventId由来UIDで延期後も同一予定として更新
- tokenなし・誤tokenは404

---

## 7. Apple / Google Calendar

### Apple Calendar

取得したtokenized ICS URLを照会カレンダーとして追加する。
Alpha Pon専用カレンダーとして表示色を設定し、iPhoneホーム画面ではApple標準カレンダーウィジェットを使用する。

### Google Calendar

「URLで追加」からtokenized ICS URLを登録できる。
同期頻度はGoogle/Apple側が決めるため、即時更新は保証しない。
重大な突発イベントはICSではなく、後続の通知Outbox経路を使う。

---

## 8. rollback

### UI不具合

1. Pagesの直前正常deployへrollback
2. `/api/market-events`不可ならSNAPSHOT fallbackを確認
3. PWA service worker versionを上げて修正版を再deploy

### D1不具合

1. Pages bindingを外さずAPIを一時停止する場合はAccessで遮断
2. D1 Time Travelまたはexportから復旧
3. `PRAGMA foreign_key_check`相当と件数監査
4. JSON/ICSを再生成

### ICS URL漏洩

1. `CALENDAR_FEED_TOKEN`をrotate
2. redeploy
3. Apple/Google Calendarへ新URLを登録
4. 旧URLが404になることを確認

---

## 9. 登録後の次Phase

Cloudflare接続後も、すぐR2やGoogle OAuthを追加しない。

優先順:

1. D1 LIVE表示の安定確認
2. 重要イベント自動登録adapter
3. notification outbox worker
4. D1 daily export
5. R2 private backup
6. 必要性が確認できた場合のみWeb Push / Google Calendar API

Edge研究は別スケジュールで継続し、インフラ実装のため停止しない。
