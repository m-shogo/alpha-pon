# Sanrio configured Foundation readiness audit v1

Status: `LOCAL_READ_ONLY_EVIDENCE_GAP_AUDIT_HARDENED`
Updated: 2026-08-07 JST

## Purpose

Measure whether the completed configured EDINET review and completed Sanrio legacy/configured parity review already contain the evidence required by the existing Foundation mapping contract.

This audit is deliberately **not** a Foundation mapping gate. It does not generate a Foundation preview, synthesize missing fields, authorize legacy replacement, or append Evidence.

## Canonical entry

After the canonical Sanrio real-pilot preflight reaches:

```text
parity_complete_foundation_gate_pending
```

`nextCommand` remains `null`. The Foundation gate is still pending.

If an exact completed parity record was selected and passed the preflight Integrity Gate, the preflight may additionally print:

```text
readOnlyFollowUpPurpose: foundation_readiness_evidence_gap_audit
readOnlyFollowUpCommand:
...
foundationGateStillPending: true
```

Only that separately labelled read-only command may be used to measure the Evidence Gap. It is not a Foundation mapping/preview/append/replacement command.

## Preconditions

The local Sanrio acquisition directory must contain:

- `configured-human-comparison-record-v1.*.json` from the issuer-neutral official-PDF human comparison review;
- `legacy-configured-parity-workspace-v1.*.json` from the Sanrio parity workspace;
- `legacy-configured-parity-review-record-v1.*.json` from the completed parity human review.

The parity workspace must point to the exact configured review by path and SHA-256. The parity human review must point to the exact workspace by file and SHA-256.

## Explicit command

When the canonical preflight advisory is unavailable, the explicit equivalent is:

```bash
bash scripts/run-sanrio-configured-foundation-readiness-audit-local.sh \
  --parity-review data/edinet/sanrio-acquisition.<timestamp>/legacy-configured-parity-review-record-v1.<timestamp>.json \
  --execute-readiness-audit
```

Prefer the preflight advisory because it uses the exact selected local parity record instead of a guessed timestamp.

The explicit `--execute-readiness-audit` flag is mandatory.

The command performs no network request and writes only local audit artifacts.

## Verification

Before measuring readiness, the canonical audit fails closed unless it can verify all of the following.

### Configured human review

- completed configured human comparison review;
- configured review outer `recordHash`;
- configured document `documentDecisionHash` values;
- configured anchor `decisionHash` values;
- declared document/anchor counts match actual arrays;
- all configured anchors completed with official PDF visual confirmation;
- Sanrio issuer identity, registry hash, and boundary hash.

### Parity workspace lineage

- parity workspace `workspaceHash`;
- nested workspace `mappingHash` / `coverageHash` values;
- workspace declared legacy/configured counts match actual arrays;
- workspace mapping/coverage records are still pending-human machine output before the human review layer;
- no duplicate legacy/configured anchor IDs;
- parity workspace configured-review path/hash lineage;
- parity configured coverage matches the configured review anchor IDs, docIDs, text hashes, and decision hashes.

### Finalized parity review lineage

- completed parity human review `recordHash`;
- exact `sourceWorkspaceHash` and source workspace file;
- declared mapping/coverage counts match actual arrays;
- completed parity mapping/coverage `humanDecisionHash` values;
- each review mapping source snapshot, `sourceMappingHash`, same-document candidates, exact-hash candidates, and machine relation exactly match the workspace source mapping;
- each review coverage source snapshot, `sourceCoverageHash`, same-document legacy candidates, exact-hash candidates, and machine relation exactly match the workspace source coverage;
- omission, duplication, or re-hashed source-field drift is rejected.

### Finalized human-decision conformance

- inventory audit human confirmation;
- mapping decisions are limited to the finalized contract values;
- coverage dispositions are limited to the finalized contract values;
- replacement recommendation is limited to the finalized contract values;
- selected configured anchors remain inside the workspace same-document candidates;
- decisions requiring selected configured evidence actually select it;
- a workspace relation with no configured document cannot be upgraded beyond `insufficient_evidence`;
- selected mapping and configured coverage disposition remain mutually consistent;
- materially inconsistent / insufficient mapping decisions and blocking / insufficient coverage dispositions retain required human notes;
- `materiallyInconsistentMappingCount`, `blockingCoverageCount`, and `insufficientEvidenceCount` are recomputed from the actual human decisions and must match the stored counts;
- replacement rationale is non-empty;
- `recommend_configured_replacement` is rejected while any material inconsistency, blocking coverage, or insufficient evidence remains;
- all non-authorizing replacement/Foundation/append boundaries remain false.

These checks deliberately repeat critical finalized invariants at the Foundation-readiness boundary. A caller cannot make an invalid record acceptable merely by recalculating its nested and outer hashes.

## Readiness categories

The output separates four states:

```text
verified_present
derivable_without_semantic_inference
partial_navigation_only
missing_required_evidence
```

A field is not upgraded merely because nearby information exists.

Examples:

- EDINET issuer codes do not substitute for governed Security Master `entityIds`.
- anchor line hashes do not substitute for document `sourceContentHash`.
- structured entry paths and anchor hashes are navigation evidence, not complete Foundation section mappings.
- human review completion does not establish PIT timestamps, license, storage policy, or revision-chain fields.

## Foundation fields measured

The audit compares current configured/parity records against the existing Foundation mapping requirements, including:

- Security Master entity IDs;
- chain root and document type;
- document source-content hash, title, summary, and language;
- `publishedAt`, `observedAt`, `retrievedAt`, `effectiveFrom`, `firstExecutableAt`, and event time state;
- retrieval run, parser, normalization, and normalized-structure lineage;
- revision kind, sequence, Evidence status, Document Revision status, and prior relation;
- license and storage policy;
- section ID, ordinal, title hash, and section content hash.

`reviewId` is classified separately as deterministically derivable because generating an identifier from verified lineage does not assert a new market or accounting fact.

## Privacy and source-content boundary

The readiness artifact does not copy:

- reviewed source text;
- confirmed fact strings;
- previously known fact strings;
- assumption strings;
- opinion strings;
- local PDF or ZIP content.

It stores only safe lineage references, hashes, counts, field names, and readiness status.

## Output

```text
configured-foundation-readiness-audit-v1.<timestamp>.json
configured-foundation-readiness-audit-v1.<timestamp>.md
```

Both files are created with mode `0600`, exclusive creation, and `fsync`.

A typical current result is expected to remain blocked until real local Foundation mapping evidence exists:

```text
readinessStatus: blocked_missing_foundation_mapping_evidence
foundationMappingGateReady: false
automaticFieldSynthesisAuthorized: false
legacyEntryPointMutationAuthorized: false
replacementAuthorized: false
foundationPreviewEligible: false
appendAuthorized: false
```

## Interpretation

A green audit execution means only that the Evidence Gap was measured consistently. It does **not** mean the Foundation pilot is green.

`foundationMappingGateReady=true`, if a future schema version ever reaches it, would still mean only that a separate human-reviewed Foundation mapping gate may be attempted. It would not itself create a preview or append any Evidence.

## Non-actions

This workflow does not:

- download from EDINET;
- call external APIs;
- infer missing PIT timestamps;
- infer Security Master IDs;
- infer license/storage rights;
- infer revision relations;
- promote anchor hashes into document/section hashes;
- infer semantic equivalence;
- change accounting/internal-control/audit/materiality/direction decisions;
- change a legacy entry point;
- create a Foundation preview;
- append Evidence or Document Revision records;
- send LINE;
- create a BUY recommendation or brokerage order;
- deploy Cloudflare or write D1;
- change Secrets, workflows, or runners.
