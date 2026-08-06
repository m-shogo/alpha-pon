# Sanrio EDINET correction diff workspace

Status: `READY_FOR_LOCAL_STRUCTURAL_DIFF`
Updated: 2026-08-06 JST
Scope: hash-verified structural comparison of original and corrected Sanrio annual filings

## Purpose

Build a local-only candidate diff from the already verified Sanrio EDINET review workspace. The command compares the original and corrected `type=1` submitted-document ZIP packages and identifies changed `PublicDoc` HTML/XHTML/XML/XBRL/TXT entries.

This is a review aid. It does not confirm the meaning, materiality, direction, accounting effect, governance implication or investment relevance of any change.

## Prerequisites

The following local flow must already be complete:

1. `run-sanrio-edinet-pilot-local.sh` produced a complete inventory;
2. `run-sanrio-edinet-acquisition-local.sh` completed with `failed: 0`;
3. `run-sanrio-edinet-review-workspace-local.sh` verified every acquisition and produced `review-workspace.json`;
4. the local macOS `unzip` command is available.

## Run

From the repository root after updating `main`:

```bash
bash scripts/run-sanrio-edinet-revision-diff-local.sh
```

The newest `data/edinet/sanrio-acquisition.*/review-workspace.json` is selected automatically. To select one explicitly:

```bash
bash scripts/run-sanrio-edinet-revision-diff-local.sh \
  --workspace data/edinet/sanrio-acquisition.<timestamp>/review-workspace.json
```

## Selection boundary

Only correction pairs matching all of the following are compared:

- the child description is `訂正有価証券報告書`;
- the child has an explicit EDINET `parentDocID`;
- the parent is present in the same review lineage group;
- both parent and child have exactly one verified `type=1` ZIP acquisition.

Confirmation reports and PDFs remain supporting human-review evidence; they are not treated as machine-comparable correction parents.

## ZIP safety and limits

The command never extracts an archive with `unzip -d`. It lists the archive and reads selected entries with `unzip -p` after rejecting:

- absolute paths;
- backslash paths;
- empty, `.` or `..` path segments;
- files outside EDINET `PublicDoc`;
- more than 500 selected entries;
- an individual selected entry over 20 MiB;
- total selected text over 100 MiB per archive.

Before reading either ZIP, the command recomputes SHA-256 and matches it to the review workspace.

## Normalization and comparison

For selected `PublicDoc` entries, the command:

- removes comments, scripts, styles and hidden inline-XBRL blocks;
- converts visible block boundaries to lines;
- decodes basic HTML entities;
- normalizes line endings and whitespace without NFKC folding;
- calculates normalized SHA-256 hashes;
- classifies archive entries as unchanged, added, removed or modified;
- records bounded before/after previews for human navigation.

A changed archive entry is only a candidate changed section. The output deliberately keeps:

```text
semanticType: unknown_pending_human_review
materiality: unknown_pending_human_review
direction: unknown_pending_human_review
reviewStatus: pending_human_review
appendAuthorized: false
```

## Output

Two mode-`0600` files are written beside the review workspace:

```text
revision-diff-workspace.<timestamp>.json
revision-diff-review.<timestamp>.md
```

The JSON contains:

- source review-workspace hash;
- original and corrected docIDs;
- verified ZIP hashes;
- PublicDoc entry counts;
- added, removed and modified entry candidates;
- normalized before/after hashes;
- bounded changed-line previews;
- per-pair deterministic `pairDiffHash`;
- deterministic `diffWorkspaceHash`;
- explicit human-review blockers;
- `appendAuthorized=false`.

## Human review boundary

For every candidate change:

1. open the original and corrected PDFs beside the structural comparison;
2. confirm the exact changed statement and context;
3. separate newly disclosed facts, previously known facts, assumptions and opinion;
4. assign semantic type only after reading the source documents;
5. confirm whether the change is informational, material or binding;
6. confirm direction as positive, negative, mixed, neutral or unknown;
7. confirm correction scope and supersession strength;
8. confirm Security Master identities and PIT timestamps;
9. author a separate reviewed manifest;
10. run the non-appendable Foundation preview before any governed append.

## Git and production boundaries

All outputs remain under ignored `data/edinet/**`. Do not force-add local EDINET content or generated review workspaces.

This command does not perform Evidence or Document Revision append, BUY/order, LINE notification, Cloudflare deployment, D1 write, or any paid API operation.
