# Handoff — Sanrio Real Local Pilot Preflight v1

Status: `IMPLEMENTED_SYNTHETIC_VALIDATION_PENDING`
Updated: 2026-08-07 JST

## Purpose

Provide one read-only local command that inspects only the local EDINET artifact lineage and tells the operator the next safe Sanrio pilot step.

It does not expose filing text, amounts or reviewed factual content. It prints only stage, relative filenames, missing prerequisite labels, metadata-only warnings and the exact next local command when one can be derived safely.

## Run

From the repository root:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

No timestamp arguments are required. The preflight resolves actual local filenames and lineage; do not guess timestamps manually.

## Stages

The preflight can report:

- `missing_edinet_root`
- `inspection_required`
- `human_review_template_required`
- `human_review_finalize_required`
- `parity_inputs_required`
- `parity_workspace_required`
- `parity_human_template_required`
- `parity_human_finalize_required`
- `parity_complete_foundation_gate_pending`

When a safe next command exists, it is printed under `nextCommand`.

## Selection rules

The preflight does not use filename recency alone. It requires stage and lineage metadata to match.

Examples:

- finalized legacy review must point to the selected inspection with `sourceInspectionFile` and be `complete_human_review`;
- current canonical `revision-human-review-decision-v1.*.json` is preferred over legacy `record-v1` compatibility records;
- inventory audit must be explicitly ready for human migration review and still non-authorizing;
- configured review must be `complete_human_comparison_review`;
- parity workspace must pin the exact selected inventory, legacy review and configured review paths;
- parity human input/record must pin the exact selected workspace.

A newer file from a different run does not replace a lineage-matching file merely because its mtime is newer.

## Safety

The tool:

- scans only `data/edinet` and one-level `sanrio-acquisition.*` directories;
- rejects symlink/non-regular/oversized/invalid JSON candidates;
- never prints JSON body contents;
- never prints confirmed facts, source text or exact amounts;
- never writes or edits local artifacts;
- never authorizes legacy/configured replacement;
- never authorizes Foundation append;
- never authorizes trading.

Rendered safety flags remain:

```text
rawContentPrinted: false
automaticReplacementAuthorized: false
foundationAppendAuthorized: false
automaticTradingAuthorized: false
```

## Important stop boundary

If `stage=parity_complete_foundation_gate_pending`, the preflight intentionally prints no automatic next command. A completed local parity review is Evidence for the next Foundation-readiness assessment; it is not itself permission to append or replace anything.

## Current practical use

For the known Sanrio pilot, running this preflight on the user's Mac should resolve whether the remaining action is:

1. prepare/finalize the unmatched-anchor human review;
2. supply missing green parity inputs;
3. build parity workspace;
4. prepare/finalize parity human review; or
5. stop at the real Foundation gate.

Synthetic CI validates the stage machine only. It does not prove which stage the user's local Mac is currently at.
