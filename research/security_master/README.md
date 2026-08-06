# Alpha Pon Security Master v1

This directory stores local append-only Security Master JSONL records. Only this
README and the nested `.gitignore` are tracked. Real entity, relationship,
provider-code and official-account data are not committed.

## Entity separation

Security Master does not treat a company name or ticker as the company itself.
It separates:

- legal entity;
- listed security;
- listing/market;
- segment;
- brand;
- facility/factory;
- product;
- verified official account.

## Exact identifier resolution

Downstream research may resolve only exact, time-valid and `verified`
identifiers. Fuzzy company-name matching is prohibited.

Supported identifiers include:

```text
jpx_code
ticker
isin
edinet_code
corporate_number_jp
lei
market_code
provider_code
internal
```

Ticker and provider-code namespaces must include their market/provider.
Overlapping verified identifiers assigned to different entities are rejected.
Old names and old tickers remain available through validity periods rather than
being overwritten.

## Relationships

Period-aware relationships cover:

```text
issuer_of
listed_on
parent_of / subsidiary_of
owns_brand
operates_facility
has_segment
produces_product
official_account_of
renamed_from
ticker_changed_from
merged_into
spun_off_from
```

Endpoint entity types are validated. Verified parent graphs cannot contain
cycles. `subsidiary_of` requires a matching `parent_of` inverse. Two verified
issuers cannot overlap for the same listed security.

## Official links

Only `verified_official` links are returned by the governed official-link API.
Claimed or unknown SNS accounts may be stored for investigation but cannot be
used as official investment evidence.

## Persistence

- append-only entity and relationship JSONL;
- deterministic SHA-256 content hashes;
- revision through `supersedesRecordId`;
- one active head per entity/relationship identity;
- revision identity and observed time cannot change backwards;
- owner-token single-writer lock;
- transaction journal across entity/relationship files;
- append followed by `fsync`;
- partial final lines and incomplete journals block use;
- no automatic stale-lock/journal deletion.

## Validation

```bash
node --import tsx/esm src/research/cli/validate-security-master.ts
node --import tsx/esm tests/research/security-master.test.ts
node --import tsx/esm tests/research/security-master-hardening.test.ts
node --import tsx/esm tests/research/security-master-repository.test.ts
```

No local records means the contracts exist, but `SECURITY_MASTER_V1_GREEN`
remains unproven.

## Incident recovery

If `entities.jsonl.batch-journal.json` exists, do not delete it automatically.
Inspect the journal state and the exact entity/relationship hashes, determine
which append completed, and perform an explicit versioned repair. Never silently
continue with a partially applied identity batch.
