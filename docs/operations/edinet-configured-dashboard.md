# Configured EDINET pipeline dashboard

Status: `LOCAL_READ_ONLY`
Updated: 2026-08-06 JST

## Purpose

Render a standalone local HTML page that verifies the configured EDINET pipeline from inventory through acquired-file review workspace v2.

The dashboard displays hashes, lineage links, safety boundaries, and bounded aggregate counts only. It never renders filing text, extracted facts, amounts, recipients, payers, or investment conclusions.

## Command

```bash
bash scripts/generate-configured-edinet-dashboard.sh \
  --workspace data/edinet/<issuerKey>-acquisition.<timestamp>/configured-review-workspace-v2.json
```

Optional registry:

```bash
bash scripts/generate-configured-edinet-dashboard.sh \
  --workspace data/edinet/<issuerKey>-acquisition.<timestamp>/configured-review-workspace-v2.json \
  --registry config/research/edinet-issuer-registry.v1.json
```

The command performs no network request.

## Source discovery

The workspace identifies:

- source review-plan file;
- source acquisition-plan file;
- acquisition-manifest file.

The review plan identifies the source inventory file.

All names are validated as local basenames. Root files must remain direct children of `data/edinet`; acquisition files must remain direct children of the selected acquisition directory. Symlinks are rejected.

## Verified stages

1. Configured inventory
2. Configured review plan
3. Explicit local acquisition plan
4. Complete canonical acquisition manifest
5. Configured review workspace v2

Each stage has its deterministic hash recomputed:

```text
inventoryHash
reviewPlanHash
planHash
manifestHash
workspaceHash
```

## Lineage checks

The dashboard verifies:

- inventory hash → review plan;
- review-plan hash → acquisition plan;
- review-plan hash → manifest;
- review-plan hash → workspace;
- acquisition-plan hash → manifest;
- acquisition-plan hash → workspace;
- manifest hash → workspace;
- review-plan filename → acquisition plan and workspace;
- acquisition-plan filename → workspace;
- manifest filename → workspace.

A validly re-hashed artifact with a changed source link is still blocked as a lineage failure.

## Safety checks

The dashboard checks stage-specific boundaries including:

- complete inventory;
- mandatory human fact promotion;
- mandatory official-PDF review;
- review plan does not authorize acquisition;
- acquisition plan requires explicit local execution;
- local-only storage;
- canonical complete manifest;
- file-integrity-verified workspace v2;
- pending human review;
- Foundation preview eligibility false;
- append authorization false.

## Status

```text
blocked_integrity
blocked_lineage
blocked_boundary
pending_human_review
```

Priority is integrity → lineage → boundary → pending review.

`pending_human_review` means the metadata pipeline is intact and safe. It does not mean filing content has been reviewed.

## Output

```text
data/edinet/<issuerKey>-acquisition.<timestamp>/configured-pipeline-dashboard-v1.json
data/edinet/<issuerKey>-acquisition.<timestamp>/configured-pipeline-dashboard-v1.html
```

Files are mode `0600`, exclusive, and durable with `fsync`.

The HTML is standalone and contains:

- no JavaScript;
- no external stylesheet or image;
- no form;
- no network connection;
- HTML-escaped dynamic values;
- restrictive Content Security Policy.

```text
default-src 'none'
script-src 'none'
connect-src 'none'
form-action 'none'
```

## Interpretation boundary

A green dashboard verifies pipeline metadata and lineage only. It does not confirm:

- API/PDF semantic equivalence;
- exact amounts or wording;
- new versus previously known facts;
- financial-statement, internal-control, or audit-opinion impact;
- materiality or market direction;
- Foundation or Evidence append eligibility.

## Non-actions

The generator does not contact EDINET, download files, mutate source artifacts, append Evidence/Foundation records, replace Sanrio v1, send LINE, create BUY/orders, deploy Cloudflare, write D1, modify Secrets, or alter workflows/runners.
