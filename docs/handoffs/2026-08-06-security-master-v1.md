# Handoff — Security Master v1

Status: `IMPLEMENTED_AWAITING_FULL_VALIDATION`
Updated: 2026-08-06 JST
Parent branch: `feat/stock-pro-council-v2-contract`
Branch: `feat/security-master-v1`

## Purpose

Prevent company-name, ticker, parent/subsidiary, brand, facility and provider-code
collisions from attaching evidence or prices to the wrong listed security.

## Implemented

- entity record schema;
- relationship record schema;
- deterministic content hashes;
- append-only entity and relationship revisions;
- legal entity / listed security / listing separation;
- name and identifier validity periods;
- old-name / old-ticker preservation;
- exact verified identifier resolver;
- listed-security -> issuer -> listing resolver;
- official-link verification boundary;
- endpoint-type validation;
- verified identifier collision detection;
- parent-cycle detection;
- ownership inverse validation;
- overlapping issuer validation;
- owner-token single-writer lock;
- cross-file transaction journal;
- partial-tail and incomplete-journal blocking;
- local repository scanner;
- focused validator CLI;
- synthetic tests;
- local-only runtime boundary and README.

## Entity types

```text
legal_entity
listed_security
listing
segment
brand
facility
product
official_account
```

A ticker is an identifier of a time-valid listed security, not a company ID.
A brand/factory/product is never attached directly to a ticker by fuzzy text.

## Resolution rule

Only exact identifiers with:

- confidence=`verified`;
- matching market/provider namespace;
- validity covering the requested `asOf` date;
- exactly one matching entity;

may resolve. Zero or multiple matches fail closed.

Recommendation-facing listed-security resolution additionally requires:

- active listed security;
- exactly one verified issuer relationship;
- a valid active legal entity;
- exactly one verified listing relationship in v1;
- a valid active listing.

## Official-source rule

`verifiedOfficialLinks()` returns only links marked `verified_official` and valid
at the requested date. Claimed/unknown SNS accounts cannot become stock facts.

## Relationship safety

- relationship endpoint types are fixed;
- self relationships are rejected;
- verified `parent_of` graph cannot contain cycles;
- verified `subsidiary_of` requires matching inverse `parent_of`;
- verified issuer periods for one listed security cannot overlap;
- ownership percentages are accepted only on ownership relationships;
- unresolved relationships cannot enter Recommendation evidence.

## Persistence safety

Entity and relationship JSONL are append-only but updated as one governed batch.
A transaction journal records:

```text
prepared
entities_appended
committed
```

Any non-committed journal blocks subsequent appends and repository use. The
system does not automatically delete or guess recovery from an incomplete batch.

## Activation gate

`SECURITY_MASTER_V1_GREEN` remains unproven until:

1. exact latest HEAD passes full typecheck and focused tests;
2. GitHub Actions executes real runner steps and passes;
3. local synthetic/real pilot records validate;
4. at least one listed security resolves to issuer and listing at two historical dates;
5. identifier collision and old-ticker fixtures remain green;
6. no fuzzy lookup path is used by Recommendation or Evidence Store.

Code and synthetic fixtures alone do not mark the milestone green.

## Validation

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
node --import tsx/esm src/research/cli/validate-security-master.ts
node --import tsx/esm tests/research/security-master.test.ts
node --import tsx/esm tests/research/security-master-hardening.test.ts
node --import tsx/esm tests/research/security-master-repository.test.ts
```

## Protected boundaries

- no real company/security master data committed;
- no API credentials;
- no active Edge or Production Gate movement;
- no Recommendation/BUY integration yet;
- no automatic order placement;
- no live LINE send;
- no Cloudflare/D1/billing changes.

## Next slice

1. PIT Universe / benchmark membership;
2. Bitemporal Evidence Store entity references use `entityId`, never raw ticker;
3. EDINET/J-Quants adapters resolve provider codes through Security Master;
4. document revision graph uses legal-entity and document IDs;
5. Decision Firewall pins a real Security Master snapshot version.
