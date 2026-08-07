# Foundation readiness boundary hardening — 2026-08-07

Status: `IMPLEMENTED_CI_GREEN_REAL_LOCAL_EVIDENCE_PENDING`

## Scope

This handoff records the nonblocking GitHub-side hardening completed while the real Sanrio EDINET pilot remains local/human-blocked.

The changes do not manufacture real Evidence and do not advance the Foundation Production gate. They make the existing local handoff safer and easier to resume.

## Merged implementation

### PR #133 — parity declared-count conformance

Foundation readiness now rejects finalized parity reviews when:

- `mappingCount` does not equal the actual `mappings` array length; or
- `coverageCount` does not equal the actual `coverage` array length.

Recomputing the outer `recordHash` does not make omitted mapping/coverage entries acceptable.

### PR #134 — exact workspace source lineage

The canonical Foundation readiness CLI now revalidates finalized parity review source fields against the exact parity workspace:

- workspace `workspaceHash`;
- nested `mappingHash` / `coverageHash`;
- source mapping / coverage hashes;
- source snapshots;
- same-document candidate IDs;
- exact-hash candidate IDs;
- machine relation;
- workspace and review item counts;
- duplicate IDs and pending-machine state.

A finalized parity review cannot replace workspace-derived source fields and regain validity merely by recalculating its nested and outer hashes.

### PR #135 — finalized human-decision conformance

The canonical Foundation readiness path now repeats critical parity finalizer invariants before the Evidence Gap is measured:

- allowed mapping decision enum;
- allowed coverage disposition enum;
- allowed replacement recommendation enum;
- mapping/coverage completion counts;
- selected configured anchors remain same-document candidates;
- required selected evidence for non-insufficient mapping decisions;
- no-configured-document remains insufficient evidence;
- mapping selection and coverage disposition consistency;
- required human notes for risky decisions;
- recomputed material-inconsistency / blocking-coverage / insufficient-evidence counts;
- non-empty replacement rationale;
- no `recommend_configured_replacement` while blockers or insufficient evidence remain.

These are validators only. They do not make the human decisions automatically.

### PR #136 — read-only readiness advisory

The canonical Sanrio real-pilot preflight still stops at:

```text
parity_complete_foundation_gate_pending
```

and still returns:

```text
nextCommand: null
```

It may now additionally print an explicitly separate read-only Evidence Gap audit command using the exact selected parity-review filename:

```text
readOnlyFollowUpPurpose: foundation_readiness_evidence_gap_audit
readOnlyFollowUpCommand:
...
foundationGateStillPending: true
```

The advisory does not generate a Foundation mapping, preview, append or replacement command.

## Current effective validation order

For the canonical local path:

```text
real-pilot preflight stage selection
-> preflight artifact content-hash integrity
-> parent-hash lineage
-> completed parity record
-> optional read-only readiness audit
-> workspace/source lineage conformance
-> finalized human-decision conformance
-> Foundation Evidence Gap measurement
-> STOP: real missing Foundation mapping Evidence remains human/local
```

## Real boundary remains unchanged

Still not satisfied by GitHub or CI:

- real official-PDF human decision for the remaining local Evidence;
- real completed parity Evidence;
- governed Security Master entity IDs;
- complete PIT timestamp set;
- document-level source-content hash and normalized-structure lineage;
- Foundation revision relations;
- license/storage policy Evidence;
- complete section mapping;
- real issuer/TOPIX/sector benchmark objects;
- real Corporate Action Clearance for the measured horizon;
- first real governed Recommendation/Outcome cycle.

Synthetic fixtures may prove validator behavior only. They are not substitutes for these records.

## Safety invariants

Unchanged:

- local EDINET/PDF/API payloads stay out of Git/PR/Actions/chat;
- no automatic fact promotion;
- no automatic semantic-equivalence inference;
- no automatic legacy replacement;
- no Foundation append;
- no automatic rule / Edge Gate / code mutation;
- no LINE BUY, brokerage order or automatic trading;
- no Cloudflare Production/D1 write;
- no Secret/billing/runner/workflow mutation.
