# Claim / Contradiction Graph v1

This directory stores local append-only Claim and ClaimGraphEdge JSONL records.
Real records are ignored by Git. Schemas, validators, synthetic fixtures and
this README remain versioned.

## Purpose

Evidence is not a conclusion. The graph separates:

- `fact`
- `assumption`
- `forecast`
- `opinion`
- `unknown`

and preserves the relations between Evidence and Claims without flattening
contradiction, correction or competing hypotheses into one confidence score.

## Runtime files

```text
research/claim_graph/claims.jsonl
research/claim_graph/edges.jsonl
```

Do not commit real rows, evidence text, licensed metadata or portfolio data.

## Relations

```text
supports
contradicts
corrects
supersedes
confirms
invalidates
expires
competes_with
better_peer
external_factor
```

Evidence-to-Evidence corrections remain in the Bitemporal Evidence Store.
The Claim Graph only connects Evidence/Claim nodes to Claim conclusions.

## Recommendation boundary

A Claim can be persisted without becoming Recommendation-eligible.

Direct Recommendation use is blocked when:

- Claim class is `opinion` or `unknown`;
- Claim status/disposition is not `active`;
- unresolved unknown references remain;
- fact/assumption/forecast has no eligible Evidence support;
- assumption/forecast has no falsification condition;
- forecast has no horizon;
- a material or binding contradiction remains;
- supporting Evidence is corrected, retracted, expired, discovery-only or
  unavailable in `system_replay` at the requested cutoff.

A valid Claim is still not a BUY, target price or order authorization.

## PIT rules

Official snapshots use:

- Security Master entities valid at the requested date;
- Bitemporal Evidence `system_replay` at the exact cutoff;
- Claim/edge records with `observedAt`, `retrievedAt` and `effectiveFrom` no
  later than that cutoff;
- full Evidence correction/retraction relations in the snapshot hash.

Future Claims and future edges are invisible to historical snapshots.

## Binding edges

A binding contradiction/correction/invalidation/expiry requires:

- at least one source Evidence record;
- Recommendation-eligible Evidence;
- primary-authoritative or primary-company Evidence;
- edge chronology after all Claim/Evidence endpoints;
- no support or disposition cycle.

Secondary news may support research, but cannot create a binding Claim
disposition by itself.

## Persistence safety

Use only the authoritative writer:

```text
appendClaimGraphRecordsAtCutoffGoverned
```

It performs, inside one owner-token lock:

- partial-tail checks;
- existing + incoming history validation;
- Security Master entity checks;
- Evidence Snapshot and cutoff checks;
- endpoint chronology checks;
- revision/cycle/one-head checks;
- deterministic content-hash checks;
- append + fsync;
- cross-file transaction journal.

If `claims.jsonl.batch-journal.json` remains, do not auto-resume or delete it.
Inspect the two JSONL tails and perform an explicit versioned repair.

## Validation

```bash
node --import tsx/esm src/research/cli/validate-claim-contradiction-graph.ts
pnpm research:validate
pnpm research:test
pnpm typecheck
pnpm typecheck:tests
```

No local records means the contract can validate, but the milestone remains
unproven.
