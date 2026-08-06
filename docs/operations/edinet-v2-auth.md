# EDINET API Version 2 authentication runbook

Status: `IMPLEMENTED_AWAITING_LOCAL_CREDENTIAL`
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

## Local document acquisition

After identifying a document ID from the list API, acquire one official document locally:

```bash
node --env-file=.env --import tsx/esm src/acquire-edinet-document.ts \
  --doc-id S100XXXX \
  --type 1
```

The `type` value is passed through as an EDINET API document type code. The code accepts only `1` through `5`; the caller must select the type required by the current official specification and pilot purpose.

Outputs are restricted to the ignored local directory:

```text
data/edinet/<docID>.type-<type>.<hash-prefix>.bin
data/edinet/<docID>.type-<type>.<hash-prefix>.metadata.json
```

The metadata records:

- exact document ID and type code
- retrieval timestamp
- byte length
- SHA-256 content hash
- response content type/disposition
- source endpoint without the API key
- `storageBoundary=local_only`

The downloader has a default 100 MiB ceiling, checks announced and actual size, uses bounded retry, and never returns the secret in its result or error text.

## Parent-document lineage

`buildEdinetDocumentLineage` validates the raw EDINET list metadata before Foundation conversion.

It detects:

- duplicate document IDs
- self-parent links
- missing parents outside the observed range
- parent/child chronology reversal
- lineage cycles

It preserves the raw withdrawal/edit/disclosure/legal status values. A parent link, correction-like title, or withdrawal flag only produces a `revisionReviewHint`. It does **not** automatically assert that the document is a correction, replacement, withdrawal, supersession, or investment fact.

A human-reviewed mapping is still required before writing Bitemporal Evidence or Document Revision records.

## Failure isolation

- authentication failure: fail the EDINET command without printing the key
- missing credentials: skip scheduled EDINET scans only and keep daily/LINE alive
- explicit local document acquisition without credentials: exit without network access
- transient network/429/5xx: bounded retry, then isolate the EDINET failure
- oversized response: reject before local persistence
- no automatic token creation or rotation
- no paid API purchase
- no LINE send, BUY notification, order, Cloudflare deployment, or D1 write

## Foundation pilot boundary

The implementation now supports authenticated document-list discovery, local binary acquisition, deterministic content hashing, and raw parent-document lineage checks.

The pilot still requires:

- local acquisition using the real issued credential
- human-reviewed correction/re-correction/withdrawal/supersession mapping
- conversion into governed Bitemporal Evidence and Document Revision records
- before/after cutoff replay
- local-only issuer, TOPIX, and sector price/benchmark objects
- governed complete Evidence Package
- preregistered Hypothesis and four Scenarios
- deterministic Council and Decision replay

## Other APIs

Do not expand broad API coverage yet. J-Quants Free may be prepared for price/benchmark adapter testing, but no paid plan is required until the Sanrio pilot demonstrates a concrete Evidence Gap. All other APIs remain deferred.
