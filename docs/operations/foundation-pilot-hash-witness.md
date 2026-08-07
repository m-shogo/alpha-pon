# Foundation pilot hash witness v1

Status: `LOCAL_HASH_RELATIONSHIP_ONLY`

## Purpose

Record the two proof relationships that the Foundation structural-status tool deliberately leaves as `manual_proof_required`:

1. the same pinned input fingerprint produces the same result hash on a distinct rerun;
2. after a correction changes the current revision head, the result at the pinned historical information cutoff remains hash-identical.

This tool verifies only the supplied IDs, timestamps, and SHA-256 relationships. It does not prove that any input is real-world evidence, licensed correctly, economically correct, or human-reviewed adequately.

## Required explicit target

Every witness is pinned to:

```text
candidateId
listedSecurityEntityId
issuerEntityId
informationCutoff
```

The correction witness uses the exact same `informationCutoff`. The tool refuses a different historical cutoff.

## Same-input witness

Supply two distinct run IDs with:

```text
baselineInputFingerprintHash
rerunInputFingerprintHash
baselineResultHash
rerunResultHash
```

Outcomes:

```text
verified_same_input_same_result_hash_unproven_realness
failed_input_fingerprint_mismatch
failed_result_hash_mismatch
```

A successful relationship sets only:

```text
sameInputHashEqualityVerified: true
```

It does not set `deterministicReplayProven=true`.

## Correction-cutoff witness

Supply two distinct before/after run IDs with:

```text
beforeHistoricalResultHash
afterHistoricalResultHash
beforeCurrentRevisionHeadHash
afterCurrentRevisionHeadHash
```

The current revision-head hashes must differ, otherwise there is no hash-level evidence that a correction state changed.

Outcomes:

```text
verified_historical_cutoff_hash_unchanged_unproven_realness
failed_no_correction_state_change
failed_historical_result_hash_changed
```

A successful relationship sets only:

```text
correctionCutoffHashImmutabilityVerified: true
```

It does not set `correctionCutoffImmutabilityProven=true`.

## Local command

```bash
bash scripts/run-foundation-pilot-hash-witness-local.sh \
  --candidate-id <candidateId> \
  --listed-security-entity-id <listedSecurityEntityId> \
  --issuer-entity-id <issuerEntityId> \
  --information-cutoff <ISO-8601> \
  --witnessed-by <local-reviewer-label> \
  --witnessed-at <ISO-8601> \
  --baseline-run-id <runId> \
  --rerun-run-id <runId> \
  --baseline-input-fingerprint-hash <sha256> \
  --rerun-input-fingerprint-hash <sha256> \
  --baseline-result-hash <sha256> \
  --rerun-result-hash <sha256> \
  --historical-cutoff <same ISO-8601 as information-cutoff> \
  --before-correction-run-id <runId> \
  --after-correction-run-id <runId> \
  --before-historical-result-hash <sha256> \
  --after-historical-result-hash <sha256> \
  --before-current-revision-head-hash <sha256> \
  --after-current-revision-head-hash <sha256> \
  --execute-hash-witness
```

Outputs are local-only:

```text
reports/foundation-pilot-hash-witness-v1.<timestamp>.json
reports/foundation-pilot-hash-witness-v1.<timestamp>.md
```

The wrapper uses `umask 077`. Files are exclusive-created with mode `0600` and `fsync`.

## Permanent boundary

Even when both hash relationships verify, the record remains:

```text
realEvidenceProven: false
deterministicReplayProven: false
correctionCutoffImmutabilityProven: false
milestoneGreenAuthorized: false
automaticTradingAuthorized: false
proofPromotionAuthorized: false
governedStoreAppendAuthorized: false
```

A separate human review must establish that the witnessed hashes came from the intended real local pilot, with valid source lineage, rights, and governed records, before any milestone status can change.

## Non-actions

The command does not:

- read or download EDINET filings;
- read raw price payloads;
- query external APIs;
- append governed stores;
- mutate Security Master, Evidence, Claims, revisions, packages, hypotheses, scenarios, replays, or decisions;
- infer entity IDs;
- bypass the real Sanrio parity Evidence gate;
- register a second real issuer;
- send LINE/BUY notifications or place orders;
- deploy Cloudflare, write D1, or change Secrets/workflows/runners.
