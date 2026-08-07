# Foundation pilot hash witness conformance v1

Status: `LOCAL_CANONICAL_CONFORMANCE_PENDING_HUMAN_CONFIRMATION`

## Purpose

Strengthen `FoundationPilotHashWitnessRecord` from PR #100 by checking that its manually supplied SHA-256 fields actually correspond to canonical local Foundation Decision records and a canonical direct Document Revision correction chain.

This is a conformance layer, not a second hash-witness engine. PR #100 remains the canonical relationship contract.

## Why this layer exists

PR #100 intentionally accepts explicit hashes so an operator can record:

- same pinned input fingerprint → same result hash;
- correction changes current revision head while historical-cutoff result hash remains unchanged.

A self-consistent set of manually supplied hashes does not prove where those hashes came from. This conformance audit binds the witness to:

- four canonical Decision run captures from `research/foundation_decisions/decisions.jsonl`;
- one canonical prior Document Revision;
- one canonical correction-like Document Revision that directly supersedes that prior revision.

## Permanent boundary

Even when conformance passes:

```text
humanRealLocalExecutionConfirmationRequired: true
realLocalExecutionConfirmed: false
realEvidenceProven: false
deterministicReplayProven: false
correctionCutoffImmutabilityProven: false
milestoneGreenAuthorized: false
automaticTradingAuthorized: false
proofPromotionAuthorized: false
governedStoreAppendAuthorized: false
```

Human confirmation is still required that the four captures followed the intended real local pipeline executions in the required sequence.

## Step 1 — capture canonical Decision runs

Immediately after each intended local pilot execution, capture the exact Decision record:

```bash
bash scripts/run-foundation-pilot-proof-run-capture-local.sh \
  --decision-id <decisionId> \
  --run-id <uniqueRunId> \
  --capture-proof-run
```

Capture four distinct runs corresponding to the PR #100 witness:

```text
same-input baseline
same-input rerun
historical baseline before correction retrieval
historical replay after correction retrieval
```

Output:

```text
reports/foundation-pilot-proof-run.<runId>.<timestamp>.json
```

Each capture recomputes the canonical Decision content hash and derives an input fingerprint from the full Decision request/pin surface, excluding only derived output fields:

```text
status
eligibleForRecommendationCandidate
blockers
contentHash
```

The Decision identity, issuedAt, cutoff, snapshot hashes, Evidence Package, Hypothesis, Scenario Set/scenarios, Council replay, calibrations, prices/benchmarks, supersession pin, and other request fields remain part of the fingerprint.

## Step 2 — create the PR #100 hash witness

Use the canonical PR #100 tool:

```bash
bash scripts/run-foundation-pilot-hash-witness-local.sh \
  ... \
  --execute-hash-witness
```

The witness must reach:

```text
sameInputHashEqualityVerified: true
correctionCutoffHashImmutabilityVerified: true
witnessStatus: hash_witness_complete_unproven_realness
```

It still remains non-authorizing.

## Step 3 — run canonical conformance

```bash
bash scripts/run-foundation-pilot-hash-witness-conformance-local.sh \
  --hash-witness reports/foundation-pilot-hash-witness-v1.<timestamp>.json \
  --same-input-baseline reports/foundation-pilot-proof-run.<run1>.<timestamp>.json \
  --same-input-rerun reports/foundation-pilot-proof-run.<run2>.<timestamp>.json \
  --historical-baseline reports/foundation-pilot-proof-run.<run3>.<timestamp>.json \
  --historical-post-correction reports/foundation-pilot-proof-run.<run4>.<timestamp>.json \
  --correction-revision-id <documentRevisionId> \
  --execute-conformance-audit
```

The audit resolves the correction revision from canonical:

```text
research/document_revisions/revisions.jsonl
```

and resolves its direct prior revision using `supersedesRecordId`.

## Same-input conformance

The audit requires PR #100 witness fields to equal the canonical run captures exactly:

```text
baselineRunId
rerunRunId
baselineInputFingerprintHash
rerunInputFingerprintHash
baselineResultHash
rerunResultHash
```

It additionally requires the two canonical Decision records to be byte-equivalent under stable canonical serialization.

Thus a pair of invented but self-consistent hashes cannot pass merely because PR #100 sees equality.

## Correction-chain conformance

The audit requires:

- PR #100 before/after run IDs match the historical run captures;
- PR #100 before/after historical result hashes equal the canonical Decision hashes;
- `beforeCurrentRevisionHeadHash` equals the canonical prior revision `contentHash`;
- `afterCurrentRevisionHeadHash` equals the canonical correction revision `contentHash`;
- correction revision directly supersedes the prior revision by `recordId`;
- document IDs match;
- correction revision sequence is exactly prior sequence + 1;
- correction kind is amendment/correction/restatement/replacement/withdrawal;
- correction is not rejected;
- correction references the target issuer or listed security;
- correction `observedAt` is later than the witness historical cutoff;
- historical baseline capture precedes correction retrieval;
- post-correction capture occurs at or after correction retrieval;
- canonical historical Decision records remain identical.

## Output

```text
reports/foundation-pilot-hash-witness-conformance-v1.<timestamp>.json
reports/foundation-pilot-hash-witness-conformance-v1.<timestamp>.md
```

The runner uses `umask 077`; files use `0600`, exclusive creation, and `fsync`.

A passing result means only:

```text
sameInput.status: conformant
correctionCutoff.status: conformant
conformanceStatus: passed
```

It does not promote the PR #100 witness or mark the Foundation milestone green.

## Failure examples

Conformance fails when:

- the PR #100 witness does not rebuild to its canonical content hash/status;
- a Decision run envelope is tampered;
- a Decision content hash is invalid;
- manually supplied witness hashes do not equal canonical Decision hashes/fingerprints;
- run IDs do not correspond to the captured runs;
- current revision-head hashes do not equal the canonical prior/correction revision hashes;
- the correction does not directly supersede the selected prior revision;
- correction timing does not fall after the historical cutoff and between baseline/post-correction capture times;
- historical canonical Decision output changes.

## Non-actions

This workflow does not:

- create a new competing hash-witness contract;
- mutate any governed Foundation store;
- synthesize a correction;
- infer entity IDs;
- access external APIs or download EDINET;
- mark deterministic replay or cutoff immutability as human-proven;
- mark a milestone green;
- send BUY/LINE notifications or place orders;
- deploy Cloudflare, write D1, or change Secrets/workflows/runners.
