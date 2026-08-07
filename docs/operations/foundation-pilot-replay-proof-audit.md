# Foundation real-pilot replay proof audit v1

Status: `LOCAL_MACHINE_PROOF_PENDING_HUMAN_CONFIRMATION`

## Purpose

Prepare the two replay proofs required by the first real Foundation pilot without letting machine equality self-authorize the milestone:

1. identical pinned Decision input → identical Decision output hash;
2. after a later correction is retrieved, replaying the same historical cutoff still returns the identical historical Decision input fingerprint and Decision content hash.

The audit verifies local artifacts and a canonical Document Revision correction witness. It does not prove by itself that the operator actually ran the intended real local pipeline four separate times.

## Permanent boundary

Even when both machine checks pass, the audit remains:

```text
humanRealLocalExecutionConfirmationRequired: true
realLocalExecutionConfirmed: false
realEvidenceProven: false
deterministicReplayProven: false
correctionCutoffImmutabilityProven: false
milestoneGreenAuthorized: false
automaticTradingAuthorized: false
```

A separate human finalization is required before these replay proofs may count toward the real-pilot milestone.

## Decision input fingerprint

The proof tool derives a SHA-256 fingerprint from the full Foundation Decision request/pin surface while excluding only derived output fields:

```text
status
eligibleForRecommendationCandidate
blockers
contentHash
```

The fingerprint therefore still includes identity, issuedAt, information cutoff, first executable time, all four Foundation snapshot hashes, Evidence Package pins/completeness, Hypothesis, Scenario Set and four Scenario pins, Council replay pins, calibration hashes, price/benchmark pins, decision ID, and supersession pin when present.

A deterministic proof passes only when:

- input fingerprints are identical;
- Decision `contentHash` values are identical;
- canonical Decision records are identical.

## Correction witness

The historical-cutoff proof also requires one canonical Document Revision record whose:

- `contentHash` recomputes correctly;
- `revisionKind` is amendment/correction/restatement/replacement/withdrawal;
- `revisionSequence > 1`;
- status is not rejected;
- entity IDs include the target issuer or listed security;
- `observedAt` is later than the historical `informationCutoff`;
- `retrievedAt >= observedAt`.

The baseline historical run must be captured before correction retrieval. The post-correction historical run must be captured at or after correction retrieval.

This prevents passing the correction proof with a revision that was already visible at the historical cutoff.

## Step 1 — capture four run observations

Immediately after each intended real local Foundation Decision execution, capture the canonical Decision record from `research/foundation_decisions/decisions.jsonl`.

```bash
bash scripts/run-foundation-pilot-proof-run-capture-local.sh \
  --decision-id <decisionId> \
  --run-id same-input-baseline \
  --capture-proof-run
```

Repeat with distinct run IDs for:

```text
same-input-baseline
same-input-rerun
historical-baseline
historical-post-correction
```

The exact labels are examples; each run ID only needs to be unique and safe.

Outputs are local gitignored files:

```text
reports/foundation-pilot-proof-run.<runId>.<timestamp>.json
```

Each envelope includes:

- capture time;
- canonical Decision record;
- Decision content hash;
- derived Decision input fingerprint;
- deterministic envelope hash;
- `automaticTradingAuthorized=false`.

The capture command requires the explicit `--capture-proof-run` flag and never writes a governed store.

## Step 2 — run the machine proof audit

After the correction revision exists in canonical `research/document_revisions/revisions.jsonl`, run:

```bash
bash scripts/run-foundation-pilot-replay-proof-audit-local.sh \
  --same-input-baseline reports/foundation-pilot-proof-run.<run1>.<timestamp>.json \
  --same-input-rerun reports/foundation-pilot-proof-run.<run2>.<timestamp>.json \
  --historical-baseline reports/foundation-pilot-proof-run.<run3>.<timestamp>.json \
  --historical-post-correction reports/foundation-pilot-proof-run.<run4>.<timestamp>.json \
  --correction-revision-id <documentRevisionId> \
  --issuer-entity-id <issuerEntityId> \
  --execute-proof-audit
```

The target candidate, listed-security ID, and historical cutoff are pinned from the same-input baseline Decision. The issuer entity ID remains explicit because Foundation Decision records intentionally carry the listed security but not a separately inferred issuer ID.

Outputs:

```text
reports/foundation-pilot-replay-proof-audit.<timestamp>.json
reports/foundation-pilot-replay-proof-audit.<timestamp>.md
```

Both runners use `umask 077`; output files use mode `0600`, exclusive creation, and `fsync`.

## Machine pass meaning

```text
machineProofStatus: passed
```

means only:

- all four run envelopes are internally hash-consistent;
- all four Decisions have valid content hashes and trading authority remains false;
- all run IDs are distinct;
- all four Decisions match the exact target candidate/security/cutoff;
- same-input pair has identical input fingerprint, Decision hash, and canonical Decision;
- correction witness is canonical and correction-like;
- correction timing is later than historical cutoff and between the baseline/post-correction captures;
- historical pair has identical input fingerprint, Decision hash, and canonical Decision.

It does **not** mean `FOUNDATION_DECISION_INTEGRATION_V1_GREEN`.

## Failure examples

The audit fails or returns machine failure when:

- an envelope/hash is tampered;
- a Decision hash is invalid;
- automatic trading authority is not false;
- the runs refer to different candidate/security/cutoff values;
- duplicate run IDs are supplied;
- same input produces different output;
- the correction revision was already observable at historical cutoff;
- the historical baseline was captured after correction retrieval;
- the post-correction run was captured before correction retrieval;
- correction witness does not reference the target issuer/security;
- historical output changes after the correction.

## Non-actions

This workflow does not:

- run or mutate the Foundation Decision pipeline;
- create Evidence, Claims, Document Revisions, packages, hypotheses, scenarios, Council replays, prices, or Decisions;
- fabricate a correction witness;
- access external APIs;
- download EDINET filings;
- authorize a Foundation milestone;
- authorize recommendation candidates beyond the existing Decision record;
- send BUY/LINE notifications or place brokerage orders;
- deploy Cloudflare or write D1;
- change Secrets, workflows, runners, or billing.
