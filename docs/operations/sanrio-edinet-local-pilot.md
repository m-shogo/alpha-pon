# Sanrio EDINET local pilot

Status: `READY_FOR_LOCAL_CREDENTIAL_RUN`
Updated: 2026-08-06 JST
Scope: Sanrio primary-disclosure inventory only

## Purpose

Use the locally configured `EDINET_API_KEY` to build a complete, local-only inventory of Sanrio filings before downloading or promoting any document into Foundation records.

This step does not create Evidence, Document Revision, Recommendation, BUY, order, LINE, Cloudflare, or D1 records.

## Official document type mapping

Verified against the Financial Services Agency's **EDINET API Specification (Version 2), June 2026**:

| type | payload | format |
|---|---|---|
| `1` | submitted document and audit report | ZIP |
| `2` | PDF | PDF |
| `3` | alternative forms and attachments | ZIP |
| `4` | English files | ZIP |
| `5` | CSV | ZIP |

The previous `buildPdfUrl()` implementation incorrectly used `type=1`. The pilot bootstrap fixes PDF to `type=2` and adds regression coverage.

## One-command local run

From the repository root after updating `main`:

```bash
bash scripts/run-sanrio-edinet-pilot-local.sh
```

Default range:

- from: January 1 of the current `--to` year
- to: current JST date
- request spacing: 300 ms

Optional explicit range:

```bash
bash scripts/run-sanrio-edinet-pilot-local.sh \
  --from 2026-01-01 \
  --to 2026-08-06
```

## Output

A new file is created with mode `0600` under:

```text
data/edinet/sanrio-edinet-inventory.<from>.<to>.<timestamp>.json
```

The command refuses to overwrite an existing file. The output contains:

- exact EDINET and securities-code identity boundary;
- all matched primary filings for the date range;
- raw EDINET status and availability flags;
- parent-document lineage and anomaly checks;
- a non-executing document-type download plan;
- `appendAuthorized=false`.

The API key is never printed or written to the inventory.

## Completeness rule

If any business date still fails after bounded retry, the run exits with code `2` and writes no inventory. A partial historical scan must not be treated as complete Evidence.

## Identity boundary

The pilot accepts filings where the filer itself matches either:

- EDINET code `E02655`; or
- securities code `81360`.

A third-party filing that merely names Sanrio as issuer or subject is excluded from this primary-disclosure inventory. Such filings can be handled later in a separate relation-aware source slice.

## Next review step

After a complete inventory is produced:

1. review document IDs, descriptions, parent links, withdrawal/edit/disclosure status and legal status;
2. select exact documents and exact type codes for local acquisition;
3. acquire selected payloads with `src/acquire-edinet-document.ts`;
4. create a human-reviewed local manifest;
5. run the non-appendable Foundation preview CLI;
6. only then consider governed append and PIT replay.

Do not paste the API key, `.env`, downloaded binaries, or raw confidential paths into chat or GitHub.
