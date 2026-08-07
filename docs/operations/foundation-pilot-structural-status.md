# Foundation real-pilot structural status v1

Status: `LOCAL_READ_ONLY_STRUCTURAL_STATUS`

## Purpose

Turn the existing Foundation repository validators into one target-scoped local status report for the first real pilot.

The command answers:

- which machine-checkable pilot stage is structurally present for the exact candidate/security/cutoff;
- which stage is first incomplete;
- which local action should happen next;
- whether any underlying repository validator is already blocking progress.

It does **not** prove that the local records are genuinely real-world evidence, licensed correctly beyond their recorded metadata, economically correct, or sufficient to mark a Foundation milestone green.

## Explicit target pinning

Do not use repository-wide counts as pilot proof. Every run requires explicit target values:

```text
candidateId
listedSecurityEntityId
issuerEntityId
informationCutoff
```

The tool does not infer Security Master IDs from EDINET codes, company names, ticker text, or prior chat context.

## Command

```bash
bash scripts/run-foundation-pilot-structural-status-local.sh \
  --candidate-id <candidateId> \
  --listed-security-entity-id <listedSecurityEntityId> \
  --issuer-entity-id <issuerEntityId> \
  --information-cutoff <ISO-8601>
```

Optional local report files:

```bash
bash scripts/run-foundation-pilot-structural-status-local.sh \
  --candidate-id <candidateId> \
  --listed-security-entity-id <listedSecurityEntityId> \
  --issuer-entity-id <issuerEntityId> \
  --information-cutoff <ISO-8601> \
  --write-local
```

`reports/*.json` and `reports/*.md` are gitignored. The runner uses `umask 077`, and report files are created with mode `0600`, exclusive creation, and `fsync`.

## Machine-checkable stages

The first ten stages are structural checks over existing governed stores:

1. `security_master_identity`
   - exact active `listed_security` target exists;
   - exact active `legal_entity` issuer exists;
   - verified `issuer_of` relationship exists;
   - verified `listed_on` relationship exists.
2. `bitemporal_primary_evidence`
   - target-scoped Evidence exists at the requested cutoff;
   - at least one primary-authoritative/company Evidence record exists.
3. `revision_correction_chain`
   - target Document Revision exists;
   - correction-like revision or Evidence relation exists;
   - reviewed/confirmed diff exists.
4. `classified_claim_graph`
   - target Claims exist and an active head is visible at cutoff;
   - fact/assumption/forecast/opinion/unknown counts are reported separately.
5. `actual_price_benchmark_objects`
   - exact candidate/security/cutoff has issuer price, issuer benchmark, TOPIX, and sector objects.
6. `complete_evidence_package`
   - exact target has an active complete Evidence Package with no blockers.
7. `registered_hypothesis`
   - exact target has a registered Hypothesis pinned to a complete target Evidence Package.
8. `registered_four_scenario_set`
   - a registered Scenario Set contains registered downside/base/upside/null-hypothesis scenarios for the registered target Hypothesis.
9. `deterministic_council_replay_object`
   - a Council replay is pinned to the target complete Evidence Package and the replay result is recommendation-candidate eligible.
10. `foundation_decision_integration`
    - exact candidate/security/cutoff has an eligible Foundation Decision record.

The tool runs the existing repository validators first. Validation errors produce `blocked_by_validation`; they are never converted into a missing-data status.

## Proof-only stages

The final two stages deliberately cannot be completed by this structural report:

11. `same_input_same_hash_proof`
12. `historical_cutoff_correction_immutability_proof`

They remain:

```text
manual_proof_required
```

Even when stages 1–10 are structurally complete.

A separate real local procedure must:

- rerun identical real inputs and prove identical hashes;
- apply a real correction and prove the prior historical-cutoff result is unchanged.

## Status vocabulary

```text
blocked_by_validation
missing
partial
structurally_ready_unproven
eligible_object_present_unproven
manual_proof_required
```

The word `unproven` is intentional. Structural presence is not real-data proof.

## Permanent non-authorizing boundary

Every output remains:

```text
realEvidenceProven: false
deterministicReplayProven: false
correctionCutoffImmutabilityProven: false
milestoneGreenAuthorized: false
automaticTradingAuthorized: false
```

This tool never changes those values.

## Relation to the Sanrio EDINET gate

The EDINET roadmap remains `BLOCKED — REAL PARITY EVIDENCE REQUIRED` for the configured human-review-to-Foundation mapping gate.

This status command does not bypass that gate. It only becomes useful after local governed Foundation records begin to exist, and it must not treat CI fixtures as real evidence.

## Non-actions

The command does not:

- call external APIs or download EDINET filings;
- create or update Security Master records;
- synthesize Evidence, Claims, revisions, prices, packages, hypotheses, scenarios, replays, or decisions;
- infer issuer/security IDs;
- append to any governed store;
- access brokerage/portfolio data;
- send LINE or BUY notifications;
- place orders;
- deploy Cloudflare or write D1;
- change Secrets, workflows, runners, or billing.
