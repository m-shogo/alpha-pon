# Handoff — Claim / Contradiction Graph v1

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/bitemporal-evidence-store-v1`
Branch: `feat/claim-contradiction-graph-v1`

## Purpose

Convert governed Evidence into explicit Claim nodes without treating summaries,
model output or majority opinion as facts. Preserve support, contradiction,
correction and competing hypotheses at the exact historical information cutoff.

## Implemented

- ClaimRecord schema;
- ClaimGraphEdgeRecord schema;
- governed ClaimGraphSnapshot schema;
- deterministic Claim, edge, Evidence Snapshot and Claim Snapshot hashes;
- Claim classes: fact / assumption / forecast / opinion / unknown;
- append-only Claim and edge revision chains;
- claim status lifecycle and terminal-state protection;
- Security Master entity references;
- Bitemporal Evidence `system_replay` dependency;
- PIT cutoff filtering for Claims and edges;
- supports / contradicts / corrects / supersedes / confirms / invalidates /
  expires / competes_with / better_peer / external_factor relations;
- binding-edge primary-Evidence requirement;
- endpoint chronology checks;
- support and disposition cycle detection;
- one logical Claim/edge chain with one active head;
- governed Recommendation-eligibility assessment;
- local repository scanner and focused CLI;
- owner-token writer, cross-file journal, append + fsync;
- synthetic core, PIT, writer, repository and snapshot fixtures;
- Research OS validation and normal test-path integration;
- local-only runtime boundary and README.

## Authoritative APIs

Downstream code must use these APIs:

```text
validateClaimGraphGovernedAtCutoff
buildClaimGraphSnapshotGovernedAtCutoff
assessClaimForRecommendationAtCutoff
appendClaimGraphRecordsAtCutoffGoverned
validateClaimGraphRepository
validateGovernedClaimGraphSnapshot
```

The lower-level functions in `claim-contradiction-graph.ts` and the earlier
`appendClaimGraphRecordsGoverned` helper remain implementation building blocks.
They are not authorized for Recommendation integration because they do not by
themselves enforce every PIT and endpoint-chronology boundary.

## Claim classes

```text
fact
assumption
forecast
opinion
unknown
```

Rules:

- fact still requires eligible Evidence support before Recommendation use;
- assumption requires falsification conditions;
- forecast requires a horizon and falsification conditions;
- opinion can be stored for dissent/context but cannot become direct evidence;
- unknown requires explicit unknown references and cannot become direct evidence.

This preserves the project rule that new facts, known facts, assumptions,
forecasts and opinions must not be silently mixed.

## Historical replay

A governed Claim snapshot pins:

- exact `asOf`;
- `system_replay` mode;
- Claim snapshot hash;
- full Evidence snapshot hash, including correction/retraction relations;
- sorted exact Claim IDs;
- sorted exact edge IDs;
- sorted exact Evidence IDs;
- final deterministic content hash.

Claims or edges observed/retrieved/effective after the cutoff are invisible to
the historical snapshot. They are also rejected when someone tries to append
them against an older Evidence Snapshot.

## Evidence correction boundary

Supporting Evidence is re-evaluated using the full Bitemporal Evidence Snapshot.
A corrected, retracted, invalidated or expired Evidence record cannot re-enter
Claim support merely because its Evidence ID still exists.

Discovery-only and unknown-license Evidence are not eligible. A binding Claim
edge additionally requires primary-authoritative or primary-company Evidence.
Secondary reporting may inform research but cannot independently invalidate a
Claim with binding force.

## Graph integrity

- Claim/edge deterministic hashes are mandatory;
- endpoint IDs must resolve at the same cutoff;
- edge observed/retrieved times must be after endpoint availability;
- material and binding edges require source Evidence;
- older Claims cannot correct or supersede newer Claims;
- terminal invalidated/superseded/expired Claims cannot be reactivated;
- support cycles are rejected;
- correction/supersession/invalidation/expiry cycles are rejected;
- explanatory `better_peer` / `external_factor` edges cannot be binding;
- competing hypotheses remain visible and are not converted into automatic vetoes.

## Recommendation boundary

A Claim is blocked when any of these apply:

```text
claim disposition is not active
claim class is opinion or unknown
unresolved unknownRefs remain
no eligible supporting Evidence
assumption/forecast lacks falsification conditions
forecast lacks horizon
material or binding contradiction remains
```

Eligibility only means the Claim may enter a later Evidence Package or Decision
Firewall. It does not mean Recommendation, BUY, target price or order.

## Persistence safety

Runtime files:

```text
research/claim_graph/claims.jsonl
research/claim_graph/edges.jsonl
```

The authoritative writer validates existing + incoming history inside one lock,
then writes a journal:

```text
prepared
claims_appended
committed
```

It uses append + fsync. If the journal remains, do not auto-resume or delete it.
Inspect both JSONL tails and perform an explicit versioned repair.

Real Claim/edge rows are ignored by Git.

## Activation gate

`CLAIM_CONTRADICTION_GRAPH_V1_GREEN` remains unproven until:

1. exact latest HEAD passes full typecheck and test suites;
2. GitHub Actions executes real runner steps and passes;
3. Security Master and Bitemporal Evidence local pilots are green;
4. at least one local Claim graph is built from real issue-time-compatible data;
5. the same cutoff and inputs reproduce the same snapshot content hash;
6. a before/after correction replay proves old Evidence cannot leak forward;
7. Decision Firewall/Evidence Package pins the governed Claim Snapshot hash;
8. synthetic Claims do not move active Edge or Production Gate state.

Code and synthetic fixtures alone do not mark the milestone green.

## Validation commands

```bash
pnpm typecheck
pnpm typecheck:tests
pnpm research:validate
pnpm research:test
node --import tsx/esm src/research/cli/validate-claim-contradiction-graph.ts
node --import tsx/esm tests/research/claim-contradiction-graph.test.ts
node --import tsx/esm tests/research/claim-contradiction-graph-pit.test.ts
node --import tsx/esm tests/research/claim-contradiction-graph-writer.test.ts
node --import tsx/esm tests/research/claim-contradiction-graph-snapshot.test.ts
```

These commands are documented but have not been run on the exact latest HEAD in
this session. The isolated clone attempt failed because outbound DNS access to
GitHub was unavailable, and GitHub Actions has not started real runner steps.

## Protected boundaries

- no automatic Recommendation persistence;
- no BUY or target-price generation;
- no automatic order placement;
- no active Edge or Production Gate movement;
- no real Evidence/Claim data committed to Git;
- no live LINE send;
- no secrets, Cloudflare, D1 or billing changes.

## Next slice

1. Document Revision / Diff graph for structured disclosure changes;
2. Evidence Package manifest that pins Evidence and Claim snapshots;
3. Testable Hypothesis and Scenario records derived from governed Claims;
4. Decision Firewall integration only through immutable snapshot hashes;
5. real pilot backfill from issue-time-compatible disclosures and corrections.
