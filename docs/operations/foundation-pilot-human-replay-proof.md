# Foundation pilot human replay proof v1

Status: `LOCAL_HUMAN_REVIEW_NON_AUTHORIZING`

## Purpose

Finalize only the two replay-proof claims after PR #101 canonical conformance has passed:

1. same intended real local input produced the same deterministic Foundation Decision output;
2. after an actual later correction was retrieved, replaying the same historical cutoff produced the unchanged historical Foundation Decision.

This is a human provenance gate over the machine-conformant artifacts. It does not certify every underlying Evidence/price/license/identity input and cannot mark the Foundation milestone green.

## Preconditions

The source must be a local PR #101 conformance record:

```text
reports/foundation-pilot-hash-witness-conformance-v1.<timestamp>.json
```

It must verify:

```text
sameInput.status: conformant
correctionCutoff.status: conformant
conformanceStatus: passed
humanRealLocalExecutionConfirmationRequired: true
realLocalExecutionConfirmed: false
deterministicReplayProven: false
correctionCutoffImmutabilityProven: false
milestoneGreenAuthorized: false
automaticTradingAuthorized: false
proofPromotionAuthorized: false
governedStoreAppendAuthorized: false
```

The conformance `contentHash` is recomputed before a review template is produced.

## Step 1 — create the human review template

```bash
bash scripts/run-foundation-pilot-human-replay-proof-local.sh \
  --conformance reports/foundation-pilot-hash-witness-conformance-v1.<timestamp>.json
```

Outputs:

```text
reports/foundation-pilot-human-replay-proof-input-v1.<timestamp>.json
reports/foundation-pilot-human-replay-proof-input-v1.<timestamp>.md
```

The template begins with all confirmations false.

## Human confirmations

A reviewer must independently confirm every field below:

```text
fourDistinctRealLocalExecutionsConfirmed
sameInputPinsActuallyIdentical
historicalBaselineExecutedBeforeCorrectionRetrieval
correctionRevisionIsActualObservedSourceChange
postCorrectionHistoricalReplayExecutedAfterCorrectionRetrieval
noSyntheticFixtureOrMockArtifactsUsed
intendedLocalPipelineAndEnvironmentConfirmed
```

All seven must be `true`.

The reviewer must also set:

```text
reviewer
reviewedAt
humanNotes
```

`humanNotes` must state what was checked locally. It must not be left empty.

## Step 2 — finalize

After editing the JSON only:

```bash
bash scripts/run-foundation-pilot-human-replay-proof-local.sh \
  --finalize reports/foundation-pilot-human-replay-proof-input-v1.<timestamp>.json
```

Output:

```text
reports/foundation-pilot-human-replay-proof-record-v1.<timestamp>.json
reports/foundation-pilot-human-replay-proof-record-v1.<timestamp>.md
```

## What completion proves

A successful human finalization may set exactly these proof claims true:

```text
realLocalExecutionConfirmed: true
deterministicReplayProven: true
correctionCutoffImmutabilityProven: true
```

This means the reviewer confirms the PR #100/#101 machine evidence came from the intended real local execution sequence and actual correction chronology.

## What completion does not prove

The final record always keeps:

```text
realEvidenceProven: false
milestoneGreenAuthorized: false
automaticTradingAuthorized: false
proofPromotionAuthorized: false
governedStoreAppendAuthorized: false
```

Why:

- replay provenance does not independently prove every underlying Evidence record is real/complete/licensed;
- it does not prove the Security Master, price/benchmark, Evidence Package, Hypothesis, Scenario, or other real-pilot gates;
- it does not authorize a recommendation, BUY, LINE notification, brokerage order, or Production Gate change;
- it does not append the proof into a governed store.

The parent Foundation roadmap must still evaluate all remaining real-pilot requirements separately.

## Fail-closed cases

Finalization is rejected when:

- PR #101 machine conformance is not passed;
- the conformance content hash is invalid;
- source conformance file/hash, target, source witness hash, or non-authorizing fields are changed;
- reviewer or reviewedAt is missing;
- any of the seven human confirmations is false or not boolean;
- proof flags are manually pre-set true before finalization;
- human notes are missing.

## Local file boundary

All files live under gitignored `reports/`.

The runner uses `umask 077`; JSON/Markdown files use mode `0600`, exclusive creation, and `fsync`.

## Non-actions

This workflow does not:

- rerun the Foundation pipeline;
- mutate Security Master, Evidence, Claim, Revision, Package, Hypothesis, Scenario, Replay, Price, or Decision stores;
- infer realness from CI fixtures;
- access external APIs or download EDINET;
- mark `FOUNDATION_DECISION_INTEGRATION_V1_GREEN`;
- authorize automatic trading;
- send LINE/BUY notifications;
- place brokerage orders;
- deploy Cloudflare or write D1;
- change Secrets, workflows, runners, or billing.
