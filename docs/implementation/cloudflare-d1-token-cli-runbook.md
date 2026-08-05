# Cloudflare D1 token CLI runbook

Status: `ACCOUNT_TOKEN_CLI_READY_REQUIRES_ONE_TIME_CREATOR_TOKEN`
Updated: 2026-08-05 JST

## Purpose

Create the least-privilege Cloudflare API tokens required by Alpha Pon's manual D1 sync workflow and store them in GitHub without printing or writing token values.

The operational tokens are **account-owned API tokens**. Cloudflare recommends account-owned tokens for durable CI/CD integrations, and D1 supports them. The one-time bootstrap credential remains a user token created from the official **Create additional tokens** template.

The CLI configures:

| Value | Cloudflare permission | GitHub location |
| --- | --- | --- |
| Read token | `D1 Read` | repository Secret `CLOUDFLARE_D1_READ_API_TOKEN` |
| Edit token | account-scoped `D1 Edit` or `D1 Write` as returned by Cloudflare | `production` environment Secret when available; otherwise repository Secret `CLOUDFLARE_D1_EDIT_API_TOKEN` |
| Account ID | n/a | repository Secret `CLOUDFLARE_ACCOUNT_ID` |

Cloudflare currently uses both `D1 Edit` and `D1 Write` labels across its permission-group API and D1 API documentation. The CLI accepts either label only when exactly one matching account-scoped permission group exists. If both or neither are returned, it fails closed rather than guessing.

The default `--edit-secret-scope auto` attempts the stronger environment-secret boundary first. If the current private-repository GitHub plan does not support environment Secrets, it falls back to a repository Secret with the same name. It never upgrades a GitHub plan or requests billing.

Explicit overrides:

```text
--edit-secret-scope environment
--edit-secret-scope repository
```

## Why account-owned tokens

User tokens act on behalf of an individual user. Account API tokens act as service principals and are the Cloudflare-recommended option for CI/CD. They remain tied to the Cloudflare account rather than to one person's dashboard identity.

Official documentation:

- `https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/`
- `https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/`
- `https://developers.cloudflare.com/fundamentals/api/reference/permissions/`
- `https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/`

## Cloudflare bootstrap limitation

The first token-creator credential cannot be bootstrapped from nothing. Create one user token in the Cloudflare dashboard with the official **Create additional tokens** template.

Do not add D1, Workers, Access, Zero Trust, billing, or any unrelated permission to the bootstrap token.

Bootstrap-token controls:

- save the token value directly in a password manager
- do not paste it into chat, source code, shell history, GitHub, or logs
- use a short TTL or client-IP restriction when practical
- run the CLI with `--revoke-bootstrap` so it revokes the bootstrap token only after successful setup

## Prerequisites

- local checkout of `m-shogo/alpha-pon`
- Node.js 22 and installed dependencies
- authenticated GitHub CLI: `gh auth status`
- repository administration permission for GitHub Secrets
- the 32-character Cloudflare account ID
- one-time Cloudflare token created from **Create additional tokens**

The D1 binding is read from `wrangler.jsonc`:

```text
database_name: alpha-pon-market-events
database_id: 7b90faf4-9834-4393-a921-275e0a68b398
```

## Dry-run

Dry-run performs no Cloudflare or GitHub write:

```bash
bash scripts/setup-cloudflare-d1-github-secrets.sh
```

Expected marker:

```text
DRY_RUN_ONLY: no Cloudflare token or GitHub Secret was changed.
```

The plan identifies:

- account-owned service-principal token ownership
- target repository and intended GitHub Secret scope
- D1 database name and ID
- requested permission names
- bounded permission-propagation retry timings
- confirmation that no D1 data, Access, Zero Trust, billing, plan, or schedule changes

## First setup

Run:

```bash
bash scripts/setup-cloudflare-d1-github-secrets.sh --apply --revoke-bootstrap
```

The shell asks for:

1. Cloudflare account ID — visible because it is an identifier, not a credential
2. one-time token-creator token — hidden with terminal echo disabled

Paste only the token value. Do not paste the `curl` command, `Authorization: Bearer`, quotes, or the token's display name.

The CLI then:

1. verifies the one-time user token
2. resolves the GitHub Edit Secret boundary without changing the GitHub plan
3. fetches current permission-group IDs instead of hard-coding them
4. selects exactly one account-scoped `D1 Read` and one account-scoped `D1 Edit` or `D1 Write`
5. creates two account-owned API tokens restricted to the explicit Cloudflare account
6. verifies each account token is active
7. verifies the expected D1 database name and ID
8. executes only `SELECT 1 AS ok`
9. retries only bounded transient authentication/service errors while a newly created token propagates
10. sends Secret values to `gh secret set` through standard input
11. confirms all three Secret names exist in their resolved scopes
12. revokes the bootstrap token only after the complete setup verifies
13. prints token IDs, names, permissions, ownership, and status only — never values

## D1 resource scope

Cloudflare's `D1 Read` and D1 write permission groups are account-scoped. Token policies cannot currently narrow these permissions to one D1 database resource.

The CLI therefore:

- restricts each token to one explicit Cloudflare account
- never uses `com.cloudflare.api.account.*`
- verifies the configured D1 database identity before GitHub Secret registration
- runs only a read-only verification query

If the account contains multiple D1 databases, the tokens can access D1 within that account according to their Read/Write permission. Do not reuse them outside Alpha Pon.

## Propagation retry

A newly created Cloudflare token can verify as active before a product endpoint accepts its policy. The CLI uses a bounded retry sequence for transient authentication and service errors only:

```text
0s, 1s, 2s, 4s, 8s, 15s
```

Permanent permission, account, or database-identity errors fail immediately. No infinite loop is allowed.

## Rotation

Rotation creates and verifies replacements before changing GitHub Secrets:

```bash
bash scripts/setup-cloudflare-d1-github-secrets.sh \
  --apply \
  --rotate \
  --revoke-bootstrap
```

After the new Secret names verify, old account-owned tokens whose names begin with the following are revoked:

```text
Alpha Pon D1 Read GitHub Actions
Alpha Pon D1 Edit GitHub Actions
```

Without `--rotate`, setup fails closed when managed account tokens or target GitHub Secrets already exist.

## Failure behavior

### Before GitHub Secret writes

New account tokens are deleted in reverse creation order. The final error contains a structured `Cleanup=` report listing successful deletions and any deletion failures.

### First setup after GitHub Secret writes begin

When no target Secret existed before execution, the CLI removes newly written Secrets and deletes newly created account tokens. The exact cleanup result is reported.

### Rotation after GitHub Secret writes begin

Old tokens are preserved. New tokens are not deleted because GitHub Secrets may already reference them. The CLI explicitly reports that rotation may be partially applied.

Token values are never printed during any failure path. Cloudflare errors are redacted against every credential held in memory.

### Recovery from the 2026-08-05 user-token authentication failure

The previous user-token CLI stopped before GitHub Secret writes when the new token received Cloudflare error `10000` on the D1 database endpoint. Its cleanup attempted to delete both newly created user tokens. Before retrying after this account-token change, confirm that no active tokens named `Alpha Pon D1 Read GitHub Actions` or `Alpha Pon D1 Edit GitHub Actions` remain under the user-token list. Do not delete unrelated `alpha-pon build token` entries.

## What this CLI does not do

- does not run D1 bootstrap
- does not apply D1 migrations
- does not write market-event rows
- does not create a public Worker write API
- does not create Access or Zero Trust resources
- does not add a GitHub Actions schedule
- does not change Cloudflare billing or request a credit card
- does not change or upgrade the GitHub plan
- does not read or expose `CALENDAR_FEED_TOKEN`
- does not change Edge research, score, threshold, or notification logic

## After setup

Run the GitHub Actions workflow manually with dry-run inputs only:

```text
Actions → Sync Cloudflare D1 Market Events → Run workflow
apply: false
```

Review the uploaded diff artifact before any apply run. Do not enable a schedule until repeated manual dry-runs and applies demonstrate idempotency and the user explicitly approves cadence and operational risk.
