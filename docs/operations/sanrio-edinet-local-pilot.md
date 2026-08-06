# Sanrio EDINET local pilot

Status: `READY_FOR_LOCAL_HUMAN_REVIEW`
Updated: 2026-08-06 JST
Scope: Sanrio primary-disclosure inventory, local acquisition and review workspace

## Purpose

Use the locally configured `EDINET_API_KEY` to build a complete, local-only inventory of Sanrio filings, acquire only the documents needed for correction lineage, and prepare a hash-verified human review workspace.

This flow does not create Evidence, Document Revision, Recommendation, BUY, order, LINE, Cloudflare, or D1 records.

## Official document type mapping

Verified against the Financial Services Agency's **EDINET API Specification (Version 2), June 2026**:

| type | payload | format |
|---|---|---|
| `1` | submitted document and audit report | ZIP |
| `2` | PDF | PDF |
| `3` | alternative forms and attachments | ZIP |
| `4` | English files | ZIP |
| `5` | CSV | ZIP |

PDF retrieval must use `type=2`. `type=1` is the structured submitted-document package.

## Step 1: create a complete inventory

From the repository root after updating `main`:

```bash
bash scripts/run-sanrio-edinet-pilot-local.sh
```

Default range:

- from: January 1 of the current `--to` year;
- to: current JST date;
- request spacing: 300 ms.

Optional explicit range:

```bash
bash scripts/run-sanrio-edinet-pilot-local.sh \
  --from 2026-01-01 \
  --to 2026-08-06
```

A new file is created with mode `0600` under:

```text
data/edinet/sanrio-edinet-inventory.<from>.<to>.<timestamp>.json
```

The inventory contains:

- exact EDINET and securities-code identity boundary;
- all matched primary filings for the date range;
- raw EDINET status and availability flags;
- parent-document lineage and anomaly checks;
- a non-executing document-type download plan;
- `appendAuthorized=false`.

If any business date still fails after bounded retry, the run exits with code `2` and writes no inventory.

## Step 2: acquire the reviewed local package

After a complete inventory exists:

```bash
bash scripts/run-sanrio-edinet-acquisition-local.sh
```

The newest direct `sanrio-edinet-inventory.*.json` file is selected automatically. To use an explicit inventory:

```bash
bash scripts/run-sanrio-edinet-acquisition-local.sh \
  --inventory data/edinet/sanrio-edinet-inventory.2026-01-01.2026-08-06.<timestamp>.json
```

Selection policy:

- annual, corrected annual, half-year, quarterly and extraordinary reports: type `1` ZIP + type `2` PDF;
- confirmation and internal-control reports: type `2` PDF;
- unknown document classes: type `2` when available, otherwise type `1`;
- parent document IDs outside the inventory: type `1` + type `2`, so correction lineage can be compared against the original filing.

The command rejects:

- partial inventories;
- inventories with failed dates;
- non-Sanrio issuer boundaries;
- inventories that do not have `appendAuthorized=false`;
- inventory symlinks or paths outside `data/edinet`.

## Acquisition output

Each run creates a new mode-`0700` directory:

```text
data/edinet/sanrio-acquisition.<timestamp>/
```

Inside it:

- type `1`, `3`, `4`, `5` payloads use `.zip`;
- type `2` payloads use `.pdf`;
- each payload has a mode-`0600` metadata JSON containing SHA-256, byte length, retrieval time and source endpoint without the API key;
- `acquisition-manifest.json` records all successes and failures;
- every record keeps `storageBoundary=local_only` and `appendAuthorized=false`.

Writes use exclusive create and refuse overwrite. If one or more tasks fail, successful downloads and the manifest are preserved, but the command exits with code `2` and `complete=false`.

## Step 3: prepare the human review workspace

After an acquisition finishes with `failed: 0`:

```bash
bash scripts/run-sanrio-edinet-review-workspace-local.sh
```

The newest acquisition manifest is selected automatically. An explicit manifest can be supplied:

```bash
bash scripts/run-sanrio-edinet-review-workspace-local.sh \
  --manifest data/edinet/sanrio-acquisition.<timestamp>/acquisition-manifest.json
```

Before creating the workspace, the command re-verifies every acquired payload:

- regular file and non-symlink boundary;
- exact byte length;
- SHA-256 against the acquisition manifest;
- docID, type, hash and byte length against the sidecar metadata;
- `storageBoundary=local_only`;
- `appendAuthorized=false`.

It then groups documents by EDINET correction lineage and writes mode-`0600` files next to the acquisition manifest:

```text
review-workspace.json
review-checklist.md
```

The workspace includes:

- original, corrected and supporting documents in the same lineage group;
- PDF/ZIP filenames, SHA-256, byte length and retrieval time;
- external parent documents acquired from outside the scanned inventory;
- document-level and group-level review checklists;
- explicit blockers for semantic summary, section hashes, Security Master resolution, PIT times and revision relations;
- deterministic `workspaceHash`;
- `reviewStatus=pending_human_review`;
- `appendAuthorized=false`.

The workspace never marks semantic mapping, correction scope or investment meaning as confirmed. Those decisions require human review and a separately authored reviewed manifest.

## Git boundary

All files and subdirectories under `data/edinet/**` are ignored by Git. This covers inventories, metadata, PDF, ZIP, acquisition manifests and review workspaces.

Do not force-add these files. Do not paste the API key, `.env`, downloaded binaries, full local paths or raw local inventory contents into chat or GitHub.

## Promotion boundary

After the review workspace is produced:

1. open each PDF and structured ZIP and confirm docID/hash identity;
2. compare each corrected filing with its original parent;
3. identify exact changed sections and claims;
4. separate newly disclosed facts, previously known facts, assumptions and opinion;
5. confirm PIT timestamps and Security Master entity IDs;
6. create a human-reviewed local manifest;
7. run the non-appendable Foundation preview CLI;
8. only then consider governed append and PIT replay.
