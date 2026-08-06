# EDINET API Version 2 authentication runbook

Status: `DRAFT_IMPLEMENTATION`
Scope: local-only primary-disclosure acquisition for the Foundation pilot
Production trading use: prohibited

## Why this exists

The previous EDINET fetcher used the retired host and stated that no API key was required. Current EDINET API Version 2 requires user registration and an issued API key.

This runbook keeps the credential local and makes missing credentials nonfatal so an EDINET outage or setup gap does not stop LINE or the daily pipeline.

## Human setup

1. Open the official EDINET site and choose the EDINET API registration entry.
2. Permit pop-ups for the official API registration host when the browser requests it.
3. Register and issue one API key.
4. Copy `.env.example` to `.env` if `.env` does not exist.
5. Set only the local value:

```dotenv
EDINET_API_KEY=<local secret>
```

Never place the key in:

- Git tracked files
- GitHub Actions logs or artifacts
- Issues, pull requests, comments, or chat
- report Markdown or JSON
- Cloudflare variables for this local pilot

The repository already ignores `.env`.

## Local verification

```bash
pnpm typecheck
pnpm typecheck:tests
pnpm scan:edinet
pnpm scan:edinet:annual
```

Expected when configured:

- requests use `https://api.edinet-fsa.go.jp/api/v2`
- the API key is supplied as the Version 2 subscription key
- 429 and transient 5xx responses use bounded retry
- errors do not print the key

Expected when not configured:

```text
EDINET: credentials_missing (EDINET_API_KEY)
EDINETのみ非致命スキップします。daily/LINE pipelineは継続できます。
```

Missing credentials are not evidence that no disclosure exists. They mean the EDINET source was not observed for that run.

## Failure isolation

- authentication failure: fail the EDINET command without printing the key
- missing credentials: skip EDINET only and return successfully
- transient network/429/5xx: bounded retry, then isolate the EDINET failure
- no automatic token creation or rotation
- no paid API purchase
- no LINE send, BUY notification, order, Cloudflare deployment, or D1 write

## Foundation pilot boundary

This migration enables document-list discovery. It does not by itself complete the Sanrio pilot.

The pilot still requires:

- authenticated local document acquisition
- correction/re-correction/withdrawal/supersession lineage
- bitemporal before/after cutoff replay
- local-only issuer, TOPIX, and sector price/benchmark objects
- governed complete Evidence Package
- preregistered Hypothesis and four Scenarios
- deterministic Council and Decision replay

## Optional parallel registration

A J-Quants Free account may be prepared in parallel for adapter smoke testing. Do not purchase a paid plan yet. The real pilot must first show whether the Free plan's delayed/history coverage can satisfy the exact event window and required TOPIX/sector benchmark objects.
