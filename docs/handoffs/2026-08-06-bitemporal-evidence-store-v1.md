# Handoff — Bitemporal Evidence Store v1

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/security-master-v1`
Branch: `feat/bitemporal-evidence-store-v1`

## Purpose

Preserve what was knowable at each historical cutoff instead of overwriting
past evidence with the latest corrected truth. Every evidence item is linked to
Security Master entities and can be corrected, contradicted, retracted,
superseded or expired without deleting prior records.

## Implemented

- EvidenceRecord schema;
- EvidenceRelationRecord schema;
- deterministic content hashes;
- event/publication/observation/retrieval/effective/executable time separation;
- provider-available versus system-replay modes;
- knowledge versus executable availability boundary;
- source-type / Evidence-Tier matrix;
- license and storage-policy validation;
- Security Master entity references;
- append-only evidence/relation revisions;
- correction/retraction/supersession relations;
- binding relation source-authority checks;
- status lifecycle and terminal-state protection;
- relation/revision cycle detection;
- Recommendation-eligible evidence selector;
- owner-token single writer;
- cross-file transaction journal;
- partial-tail/incomplete-journal blocking;
- local repository scanner;
- focused validator CLI;
- synthetic fixtures;
- local-only runtime boundary and README.

## Time semantics

```text
eventAt
publishedAt
observedAt
retrievedAt
effectiveFrom / effectiveTo
firstExecutableAt
```

Required ordering:

- publishedAt <= observedAt <= retrievedAt;
- firstExecutableAt >= max(observedAt, retrievedAt);
- effectiveTo >= effectiveFrom;
- revision observedAt/retrievedAt increase monotonically.

A future planned event may have eventAt after publication. Unknown event time is
stored explicitly rather than inferred.

## Replay modes

```text
provider_available
  observedAt <= cutoff

system_replay
  observedAt <= cutoff
  retrievedAt <= cutoff
```

Recommendation uses `system_replay`. Event Study/Net Alpha additionally uses the
`executable` boundary when calculating entries.

## Evidence hierarchy

- statutory/exchange/government/regulator/court: primary_authoritative;
- company IR/official transcript: primary_company;
- reliable news: secondary_reliable;
- discovery source: discovery_only.

Research papers and licensed alternative data remain bounded by their explicit
source-type policy. Discovery-only material cannot promote itself into
Recommendation evidence.

## Correction and retraction

Old evidence is never rewritten or deleted.

```text
new Evidence
-> corrects / retracts / supersedes / invalidates / expires
-> prior Evidence
```

A binding relation:

- requires a primary-authoritative or primary-company source;
- must be observable after its source Evidence;
- cannot originate from older Evidence to correct newer Evidence;
- cannot originate from inactive/retracted Evidence;
- cannot participate in a cycle.

Historical snapshots before the correction continue to show the original
Evidence as active.

## License boundary

- unknown license: reject;
- metadata-only: metadata/hash only;
- local-only content: local storage only;
- redistributable content: explicit redistribution right required.

No raw evidence content or licensed metadata is committed to Git.

## Persistence safety

Evidence and relation files are one governed batch:

```text
prepared
evidence_appended
committed
```

Any incomplete journal blocks future use and append. Automatic repair or journal
deletion is forbidden. The authoritative writer validates existing + incoming
history together:

```text
appendEvidenceStoreRecordsGovernedStrict
```

## Activation gate

`BITEMPORAL_EVIDENCE_STORE_V1_GREEN` remains unproven until:

1. exact latest HEAD passes full typecheck and focused tests;
2. GitHub Actions executes real runner steps and passes;
3. Security Master local pilot entities validate;
4. at least one disclosure and later correction replay correctly before/after cutoff;
5. identical inputs reproduce identical Evidence snapshots/hashes;
6. Recommendation and Decision Firewall consume `system_replay` only;
7. no discovery-only or unknown-license Evidence reaches Recommendation.

Code and synthetic fixtures alone do not mark the milestone green.

## Validation

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
node --import tsx/esm src/research/cli/validate-bitemporal-evidence.ts
node --import tsx/esm tests/research/bitemporal-evidence-store.test.ts
node --import tsx/esm tests/research/bitemporal-evidence-hardening.test.ts
node --import tsx/esm tests/research/bitemporal-evidence-repository.test.ts
```

## Protected boundaries

- no real evidence or source content committed;
- no API credentials;
- no Recommendation/BUY integration yet;
- no active Edge or Production Gate movement;
- no automatic order placement;
- no live LINE send;
- no Cloudflare/D1/billing changes.

## Next slice

1. Claim / Contradiction Graph consumes immutable Evidence IDs;
2. Document Diff / Revision Graph creates correction/supersession relations;
3. EDINET v2 and TDnet importers emit governed EvidenceRecords;
4. Decision Firewall pins a real Evidence Store snapshot version;
5. first Known-Bad Evidence Package uses issue-time evidence only.
