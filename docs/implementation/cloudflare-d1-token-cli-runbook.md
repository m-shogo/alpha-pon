# Cloudflare D1 token CLI runbook

Status: `FINAL_ACCOUNT_TOKENS_REQUIRED`
Updated: 2026-08-05 JST

## Purpose

Verify two final Cloudflare Account API tokens for Alpha Pon's D1 workflow and register them as GitHub Secrets without printing, persisting, or passing token values as command arguments.

The importer configures:

| Value | Cloudflare permission | GitHub location |
| --- | --- | --- |
| Read token | `D1 Read` | repository Secret `CLOUDFLARE_D1_READ_API_TOKEN` |
| Write token | `D1 Write` or dashboard-equivalent `D1 Edit` | `production` environment Secret when available; otherwise repository Secret `CLOUDFLARE_D1_EDIT_API_TOKEN` |
| Account ID | identifier only | repository Secret `CLOUDFLARE_ACCOUNT_ID` |

## Why direct dashboard creation is required

The Cloudflare **Create additional tokens** template creates a user-owned bootstrap token with permission to manage user-owned API tokens. It does not grant `Account API Tokens Read` or `Account API Tokens Write`, which are required by `/accounts/{account_id}/tokens` endpoints.

Alpha Pon therefore does not attempt nested Account API Token creation. Create the two final Account API tokens directly in the dashboard and import them through hidden prompts.

Official references:

- `https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/`
- `https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/list/`
- `https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/create/`
- `https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/`

## Create the final tokens

Cloudflare Dashboard:

```text
Manage Account → Account API Tokens → Create Token
```

Create two separate account-owned tokens for the explicit Alpha Pon account:

1. `Alpha Pon D1 Read GitHub Actions`
   - Account permission: `D1 Read`
   - Resource: the current Alpha Pon account only
2. `Alpha Pon D1 Write GitHub Actions`
   - Account permission: `D1 Write` or the write-equivalent label shown by the dashboard
   - Resource: the current Alpha Pon account only

Do not add Workers, Access, Zero Trust, billing, account-token-management, or unrelated permissions. Token values are shown once. Save each directly in a password manager and do not paste either value into chat.

Creating Account API tokens requires the appropriate Cloudflare account administrator role. D1 supports account-owned tokens.

## Remove the temporary bootstrap token

The temporary user token named `Alpha Pon Temporary Token Creator` is no longer needed. Revoke it manually after the final tokens are safely stored. It must not be used as either final D1 token.

## Dry-run

```bash
bash scripts/setup-cloudflare-d1-github-secrets.sh
```

Dry-run makes no Cloudflare or GitHub change and prints:

```text
DRY_RUN_ONLY: no Cloudflare token or GitHub Secret was changed.
```

## Import and verify

```bash
bash scripts/setup-cloudflare-d1-github-secrets.sh \
  --apply \
  --account-id a820e23d890fcfeccdcbac6531543d83
```

The shell asks for two hidden values in this order:

1. final D1 Read account token
2. final D1 Write account token

The importer then:

1. verifies each token with the account-token verification endpoint
2. verifies the configured D1 database name and ID
3. executes only `SELECT 1 AS ok` with each token
4. uses bounded retries only for temporary propagation/service errors
5. sends values to `gh secret set` via standard input
6. confirms all three Secret names in their resolved scopes
7. prints token IDs and Secret names only, never token values

The importer does not create, list, update, roll, or delete Cloudflare tokens. It cannot revoke the temporary bootstrap token.

## Existing GitHub Secrets

The first setup fails closed if a target Secret already exists. After reviewing existing Secret names, an intentional replacement can use:

```text
--replace-existing
```

The importer verifies both Cloudflare tokens before replacing any Secret.

## D1 binding

Read from `wrangler.jsonc`:

```text
database_name: alpha-pon-market-events
database_id: 7b90faf4-9834-4393-a921-275e0a68b398
```

## Safety boundary

The importer:

- does not create or delete Cloudflare tokens
- does not run D1 bootstrap
- does not apply migrations
- does not write market-event rows
- does not create a public Worker write API
- does not create Access or Zero Trust resources
- does not add a schedule
- does not change billing or GitHub plan
- does not read or expose `CALENDAR_FEED_TOKEN`
- does not change research, scoring, or notification logic

## After successful import

Run only the manual GitHub Actions D1 dry-run:

```text
Actions → Sync Cloudflare D1 Market Events → Run workflow
apply: false
```

Review its artifact before any apply run. Do not enable a schedule without explicit approval.
