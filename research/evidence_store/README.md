# Alpha Pon Bitemporal Evidence Store v1

This directory stores local append-only EvidenceRecord and EvidenceRelationRecord
JSONL files. Only this README and the nested `.gitignore` are tracked. Real
source metadata, document identifiers and licensed/local evidence are not
committed.

## Time model

Every EvidenceRecord separates:

```text
eventAt          underlying event time
publishedAt      source publication time
observedAt       lawful/public availability time
retrievedAt      actual Alpha Pon retrieval time
effectiveFrom/To claim/evidence validity interval
firstExecutableAt earliest executable market time after knowledge
```

`eventAtStatus=unknown` is preserved as an explicit uncertainty. It is not
silently replaced with publication time.

## Replay modes

```text
provider_available
  observedAt <= cutoff

system_replay
  observedAt <= cutoff
  retrievedAt <= cutoff
```

Recommendation-facing evidence requires `system_replay`. Event-study execution
may additionally select the `executable` boundary, which requires
`firstExecutableAt <= cutoff`.

## Evidence tiers

Source type and Evidence Tier are validated together. For example:

- statutory/exchange/government/regulator/court -> primary_authoritative;
- company IR/official transcript -> primary_company;
- reliable news -> secondary_reliable;
- discovery source -> discovery_only.

Discovery-only evidence cannot become Recommendation evidence.

## Relations and historical truth

Relations are append-only and include:

```text
supports
contradicts
corrects
retracts
supersedes
confirms
invalidates
expires
```

Correction/retraction does not delete the old EvidenceRecord. A binding relation
changes its disposition only in snapshots where the relation was already
observable/retrieved.

Binding correction/supersession:

- requires primary-authoritative or primary-company source evidence;
- cannot originate from inactive/retracted evidence;
- cannot point from older evidence to newer evidence;
- cannot form a cycle.

## Entity identity

Every EvidenceRecord references Security Master `entityId` values. Raw ticker or
fuzzy company-name attachment is prohibited. Repository validation resolves the
Security Master snapshot at the same requested as-of date.

## License and storage

- `license=unknown` is rejected;
- metadata-only licenses permit only metadata/hash storage;
- local-only content cannot be marked redistributable;
- redistributable content requires explicit redistribution rights.

## Persistence

- deterministic SHA-256 hashes;
- append-only revisions via `supersedesRecordId`;
- revision identity/time monotonicity;
- one active head per Evidence/relation identity;
- owner-token single-writer lock;
- transaction journal across evidence/relation files;
- append followed by `fsync`;
- partial tails and incomplete journals block use;
- no automatic stale-lock/journal deletion.

The authoritative write path is:

```text
appendEvidenceStoreRecordsGovernedStrict
```

## Validation

```bash
node --import tsx/esm src/research/cli/validate-bitemporal-evidence.ts
node --import tsx/esm tests/research/bitemporal-evidence-store.test.ts
node --import tsx/esm tests/research/bitemporal-evidence-hardening.test.ts
node --import tsx/esm tests/research/bitemporal-evidence-repository.test.ts
```

No local evidence means the contracts exist, but
`BITEMPORAL_EVIDENCE_STORE_V1_GREEN` remains unproven.
