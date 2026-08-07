# Sanrio real-pilot preflight integrity gate

Status: implemented in `fix/sanrio-preflight-integrity-gate-v1`

## Purpose

The canonical local preflight must not emit a next-stage command merely because filenames, review status, and source filenames appear to line up. Before rendering a command, selected machine-generated/finalized artifacts are rechecked for deterministic content hashes and parent-hash lineage.

## Verified boundaries

- unmatched-anchor inspection: `reportHash` is recomputed from its governed hash payload;
- finalized legacy human decision: `recordHash` is recomputed and `sourceInspectionHash` must equal the selected inspection hash;
- inventory compatibility audit: `auditHash` is recomputed from its governed hash payload;
- configured human comparison record: `recordHash` is recomputed;
- parity workspace: `workspaceHash` is recomputed and all three parent hashes must equal the selected inventory, legacy review, and configured review hashes;
- finalized parity review: `recordHash` is recomputed and `sourceWorkspaceHash` must equal the selected workspace hash.

Human-editable draft inputs are treated differently on purpose. Their free-text/human fields may be edited without refreshing the template envelope hash, so the preflight checks their parent hash and safety state rather than demanding a newly recomputed draft envelope.

## Fail-closed behavior

Any mismatch throws before `renderSanrioRealPilotPreflight` is called. The canonical script therefore exits non-zero and does not print a next command.

The integrity gate does not authorize semantic equivalence, replacement, Foundation append, fact promotion, BUY/LINE/order execution, or any Production change.

## Canonical local entrypoint

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

If this fails with an integrity mismatch, do not rename, rehash, or hand-edit the finalized artifact to bypass the failure. Preserve the local files and inspect/recreate the affected upstream stage.
