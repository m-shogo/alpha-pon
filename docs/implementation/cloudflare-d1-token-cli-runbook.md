# Cloudflare D1 token CLI runbook

Status: `CLI_READY_REQUIRES_ONE_TIME_CREATOR_TOKEN`
Updated: 2026-08-05 JST

## Purpose

Create the least-privilege Cloudflare API tokens required by Alpha Pon's manual D1 sync workflow and store them in GitHub without printing or writing token values.

The CLI configures:

| Token | Cloudflare permission | GitHub location |
| --- | --- | --- |
| Read token | `D1 Read` | repository Secret `CLOUDFLARE_D1_READ_API_TOKEN` |
| Edit token | `D1 Edit` | `production` environment Secret `CLOUDFLARE_D1_EDIT_API_TOKEN` |
| Account ID | n/a | repository Secret `CLOUDFLARE_ACCOUNT_ID` |

The Edit token is not stored as a repository-wide Secret. It becomes available only to jobs that declare the `production` environment.

## Cloudflare bootstrap limitation

Cloudflare does not allow the first API-token-creator credential to be bootstrapped entirely from the API or Wrangler.

One initial token must be created in the Cloudflare dashboard with the official **Create additional tokens** template. Cloudflare documents that `API Tokens: Edit` is unavailable in the Custom Token builder and that this template is required before calling `POST /user/tokens`.

Official documentation:

- `https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/`
- `https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/create/`

This is the only mandatory dashboard step. Do not add D1, Workers, Access, Zero Trust, billing, or any other permission to this bootstrap token.

Recommended bootstrap-token controls:

- save it directly in a password manager
- do not paste it into chat, source code, shell history, GitHub, or logs
- use a short TTL or client-IP restriction when practical
- run the CLI with `--revoke-bootstrap` so it revokes the bootstrap token after successful setup

## Prerequisites

- local checkout of `m-shogo/alpha-pon`
- Node.js 22 and installed dependencies
- authenticated GitHub CLI: `gh auth status`
- repository administration permission for GitHub Secrets and environments
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

It displays only the plan:

- target repository and GitHub environment
- D1 database name and ID
- requested permission names
- GitHub Secret names
- confirmation that no D1 data, Access, Zero Trust, billing, or schedule will change

## First setup

Run one command:

```bash
bash scripts/setup-cloudflare-d1-github-secrets.sh --apply --revoke-bootstrap
```

The shell asks for:

1. Cloudflare account ID — visible input because it is an identifier, not a credential
2. one-time token-creator token — hidden input with terminal echo disabled

The CLI then:

1. verifies the one-time creator token
2. fetches the current Cloudflare permission-group IDs instead of hard-coding them
3. selects exactly one account-scoped `D1 Read` and `D1 Edit` permission
4. creates two user-owned API tokens restricted to the specified Cloudflare account
5. verifies both tokens are active
6. verifies both tokens resolve the configured D1 database
7. executes only `SELECT 1 AS ok` as the D1 access check
8. creates or confirms the GitHub `production` environment
9. sends Secret values to `gh secret set` through standard input
10. confirms the three Secret names exist
11. revokes the one-time creator token when `--revoke-bootstrap` is present
12. prints token IDs, names, permissions, and status only — never values

## D1 resource scope

Cloudflare's `D1 Read` and `D1 Edit` permission groups are account-scoped. Cloudflare token policies cannot currently narrow these permissions to one D1 database resource.

The CLI therefore:

- restricts each token to one explicit Cloudflare account
- never uses `com.cloudflare.api.account.*`
- verifies the expected D1 database name and ID before GitHub Secret registration

If the Cloudflare account contains multiple D1 databases, these tokens can access D1 within that same account according to their Read/Edit permission. Do not reuse them outside Alpha Pon.

## Rotation

Rotation creates and verifies replacement tokens before changing GitHub Secrets:

```bash
bash scripts/setup-cloudflare-d1-github-secrets.sh \
  --apply \
  --rotate \
  --revoke-bootstrap
```

After all GitHub Secret names verify successfully, old managed tokens whose names begin with:

```text
Alpha Pon D1 Read GitHub Actions
Alpha Pon D1 Edit GitHub Actions
```

are revoked.

Without `--rotate`, setup fails closed if managed Cloudflare tokens or target GitHub Secrets already exist.

## Failure behavior

### Before GitHub Secret writes

Newly created Cloudflare tokens are revoked on a best-effort basis.

### First setup after GitHub Secret writes begin

When no target Secret existed before execution, the CLI removes newly written Secrets and revokes newly created tokens on a best-effort basis.

### Rotation after GitHub Secret writes begin

Old tokens are preserved. The CLI does not pretend rollback occurred because GitHub Secret updates are not transactional. Inspect Secret names and Cloudflare token metadata before retrying.

Token values are never printed during any failure path. Cloudflare errors are redacted against every credential held in memory.

## What this CLI does not do

- does not run D1 bootstrap
- does not apply D1 migrations
- does not write market-event rows
- does not create a public Worker write API
- does not create Access or Zero Trust resources
- does not add a GitHub Actions schedule
- does not change Cloudflare billing or request a credit card
- does not read or expose `CALENDAR_FEED_TOKEN`
- does not change Edge research, score, threshold, or notification logic

## After setup

Run the GitHub Actions workflow manually with dry-run inputs only:

```text
Actions → Sync Cloudflare D1 Market Events → Run workflow
apply: false
```

Review the uploaded diff artifact before any apply run. Do not enable a schedule until repeated manual dry-runs and applies demonstrate idempotency and the user explicitly approves cadence and operational risk.
