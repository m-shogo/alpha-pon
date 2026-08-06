# EDINET local review dashboard

Status: `LOCAL_READ_ONLY`
Updated: 2026-08-06 JST

## Purpose

Generate one standalone HTML page that summarizes the latest governed Sanrio EDINET review artifacts stored locally under `data/edinet`.

The dashboard is designed for orientation and integrity checks. It does not edit JSON, resolve review decisions, promote facts, append Foundation/Evidence records, replace the legacy inventory entry point, or contact any network service.

## Command

Use the latest Sanrio acquisition directory automatically:

```bash
bash scripts/generate-edinet-local-review-dashboard.sh
```

Use a specific acquisition directory:

```bash
bash scripts/generate-edinet-local-review-dashboard.sh \
  --acquisition data/edinet/sanrio-acquisition.20260806T064708Z
```

## Output

The selected acquisition directory receives:

```text
edinet-local-review-dashboard-v1.<timestamp>.json
edinet-local-review-dashboard-v1.<timestamp>.html
```

Both files are mode `0600`, exclusive, and durable with `fsync`.

Open the generated HTML locally in a browser. The page has no form, no JavaScript, no external stylesheet, no image, and no network connection.

## Recognized stages

The dashboard selects the newest recognized JSON for each stage and reports the number of historical files found:

1. acquisition/review workspace;
2. revision diff v2;
3. cross-period triage;
4. focused correction review;
5. API/PDF source fidelity;
6. unmatched-anchor inspection;
7. PDF visual-review input/final;
8. review-next batching;
9. review-next full-text/numeric/footnote content;
10. financial-statement/internal-control/audit impact input/final;
11. configured inventory metadata when available at the EDINET root;
12. legacy/configured inventory compatibility audit.

Unknown JSON files are ignored and their fields are not rendered.

## Integrity checks

For supported artifacts, the dashboard recomputes the stage-specific deterministic hash using the original contract:

- `workspaceHash`;
- `diffWorkspaceHash`;
- `triageWorkspaceHash`;
- `focusedBundleHash`;
- `fidelityReportHash`;
- unmatched inspection `reportHash`;
- human/impact `recordHash`;
- review-next `workspaceHash` and `bundleHash`;
- configured `inventoryHash`;
- compatibility `auditHash`.

A latest-stage mismatch produces:

```text
dashboardStatus: blocked_integrity
```

The dashboard does not repair or overwrite a failed artifact.

## Safety-boundary checks

Each recognized artifact must remain:

```text
source: edinet
issuer: E02655 / 81360
appendAuthorized: false
```

Where present, these must not be true:

```text
replacementAuthorized
foundationPreviewEligible
```

A violation produces:

```text
dashboardStatus: blocked_boundary
```

## Displayed information

The dashboard shows only bounded metadata:

- local file basename and location class;
- generated/modified times;
- review status;
- integrity and safety status;
- selected aggregate count fields;
- bounded blocker and integrity issue lists;
- history count;
- top-level hashes and dashboard hash.

It does not render full extracted filing text, confirmed facts, amounts, recipient/payer data, API keys, environment variables, portfolio data, or arbitrary unknown JSON fields.

All dynamic text is HTML-escaped. The page includes a restrictive Content Security Policy:

```text
default-src 'none'
script-src 'none'
connect-src 'none'
form-action 'none'
```

Inline CSS is the only permitted local presentation resource.

## Status interpretation

- `blocked_integrity`: at least one latest artifact failed its deterministic hash.
- `blocked_boundary`: hashes passed, but an append/replacement/Foundation safety boundary failed.
- `pending_human_review`: integrity and safety passed, and one or more latest stages remain pending/draft.
- `review_complete_non_appendable`: no latest stage is pending, but the dashboard still cannot authorize append.

## Limits

This page is not a substitute for opening the official EDINET PDF. It does not complete the pending one-anchor Sanrio visual review, determine materiality or direction, or prove full-document equivalence.

## Non-actions

The generator performs no EDINET request, filing download, JSON mutation, Evidence/Foundation append, LINE send, BUY/order action, Cloudflare deploy, D1 write, Secret update, billing change, workflow change, or runner change.
