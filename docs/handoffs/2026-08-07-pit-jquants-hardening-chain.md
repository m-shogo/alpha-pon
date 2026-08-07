# PIT / J-Quants Hardening Handoff — 2026-08-07

Status: `IMPLEMENTATION_GREEN_REAL_DATA_GATES_PENDING`

## Why this handoff exists

The 2026-08-07 GitHub-safe work moved from Foundation-readiness validation into the PIT price / Recommendation / Outcome stack after concrete defects were found. This file records the resulting safety boundary so later sessions do not rediscover or weaken it.

## Merged chain covered here

```text
#140 reject hard-linked private price-store files
#142 reject orphan supersedesHash at price-series roots
#143 reject impossible Gregorian J-Quants dates and invalid query ranges
#144 require firstExecutableAt >= retrievedAt
#145 revalidate issuer / TOPIX / sector pinned timelines in Recommendation
#146 revalidate baseline / measurement timelines in Quantitative Outcome
#147 accept only YYYYMMDD or YYYY-MM-DD J-Quants date shapes
#148 reject impossible firstExecutableAt before local J-Quants network fetch
#150 preserve actual retrieval-completion time instead of backdating to fetch start
```

PR #141 was superseded rather than force-rewritten when main moved. Its calendar work was recreated safely and merged as #143.

## Canonical PIT invariant

```text
dataAsOf <= observedAt <= retrievedAt <= firstExecutableAt
```

This is now enforced at several layers intentionally.

### Price Store

`src/research/price-store.ts`

- record validation rejects execution before retrieval;
- provider batch validation rejects execution before batch retrieval;
- append path receives the same validation;
- revision roots cannot claim an unknown parent hash.

### J-Quants Free mapper

`src/research/providers/jquants-free.ts`

- `retrievedAt` cannot precede the conservative Free observation boundary;
- `firstExecutableAt` cannot precede `retrievedAt`;
- malformed/impossible dates fail before fetch where query input is involved.

### Local J-Quants CLI

`src/research/cli/fetch-jquants-free-price.ts`

- explicit network flag remains required;
- credentials-missing remains non-fatal;
- requested `--first-executable-at` must be at or after retrieval start **before** `provider.fetchDaily(...)`;
- `retrievalStartedAt` is only preflight/query-cutoff state;
- PriceRecord `retrievedAt` is sampled by the provider **after** `fetchQuotes` completes;
- resolver rechecks `firstExecutableAt >= actual retrievedAt`;
- local append validation clock is sampled again after fetch;
- mapper/Price Store still provide final downstream defenses.

Do not conflate the two retrieval timestamps:

```text
retrievalStartedAt = network前のpreflight / request cutoff
retrievedAt        = network完了後のactual ingestion timestamp
```

The provider regression explicitly fixes ordering to:

```text
fetch-start -> fetch-complete -> retrieved-at-sampled
```

### Recommendation

`src/research/recommendation-persistence.ts`

A PriceRecord is not trusted merely because its `contentHash` was recomputed successfully. Issuer, TOPIX and sector pins also pass the reusable timeline validator.

A record with:

```text
retrievedAt = 09:05
firstExecutableAt = 09:00
```

is rejected even when it carries the correct newly recomputed hash.

### Quantitative Outcome

`src/research/quantitative-outcome.ts`

- baseline issuer / TOPIX / sector records pass timeline validation;
- post-issue rows that become actual measurement candidates pass the same validation;
- unrelated future rows do not block a historical Outcome;
- a re-hashed invalid measurement row cannot generate ROI / benchmark excess / sector excess returns.

## Private storage boundary

Real price data stays local-only.

Private store requirements:

```text
provider root = 0700
price file    = 0600
```

Rejected before unsafe write where applicable:

- symlink file;
- dangling symlink;
- symlink root;
- nested path outside canonical direct-child shape;
- hard-linked price file (`nlink != 1`).

The hard-link guard executes before chmod/append so an outside pathname sharing the inode is not modified.

## J-Quants date boundary

Accepted forms:

```text
YYYYMMDD
YYYY-MM-DD
```

Then Gregorian validation is applied. JavaScript Date rollover is not authoritative.

Rejected examples:

```text
2024-02-31
2023-02-29
2026-13-01
2026--05-14
2026-0514
202605-14
```

Malformed query dates are rejected before the fetcher is called.

## What remains intentionally unknown

Do not infer these from fixtures:

- exact intraday time when Free delayed rows become available;
- real rolling two-year edge behavior;
- real missing / no_trade / suspension row shapes;
- unusual real security-code representations;
- future entitlement changes.

Measure them only with local credentials when available.

## Benchmark boundary

J-Quants Free is not the real-pilot benchmark solution.

The real Foundation pilot still needs a rights-verified local-only source for:

- TOPIX;
- sector benchmark.

Do not fabricate these series and do not silently substitute an unrelated index.

## Corporate Action boundary

Raw/unadjusted price Outcome requires Evidence-backed Corporate Action Clearance for the full measured horizon. Do not interpret a split, reverse split, dividend, merger, spin-off or other action as ordinary price alpha.

## Current real blockers

GitHub-safe software work is green. The remaining high-value blockers are local/human/rights gates:

1. finish real Sanrio EDINET human review / parity;
2. reach the read-only Foundation readiness gate with real local Evidence;
3. obtain rights-verified issuer / TOPIX / sector price objects locally;
4. confirm Corporate Action Evidence;
5. only then persist one real Recommendation and later one Quantitative Outcome if Evidence genuinely supports it.

Synthetic fixtures do not satisfy any of those real milestones.

## User resume commands

### Sanrio real pilot — canonical first command

From repo root:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

Use only the printed `nextCommand`, then rerun the same preflight. Do not guess timestamped filenames. Stop mutating progression at `parity_complete_foundation_gate_pending`; the read-only Foundation readiness advisory may be run if printed.

### J-Quants Free

Dry-run/no network:

```bash
bash scripts/run-jquants-free-price-provider-local.sh
```

Real fetch remains explicit and local-only. When supplying `--first-executable-at`, use a future execution timestamp that will still be at or after the actual fetch completion; do not copy an old fixed example timestamp. If the network fetch finishes after the supplied timestamp, the mapper correctly rejects the record.

## Do not do

- do not commit real EDINET or J-Quants payloads;
- do not put licensed raw prices in Actions artifacts or chat;
- do not edit hashes to make Evidence pass;
- do not backdate `retrievedAt` to request start;
- do not weaken timestamp validation for a fixture;
- do not force-push/rewrite around generated-main drift;
- do not modify runners/workflows without a measured workflow defect;
- do not create automatic BUY/LINE/order behavior from these records;
- do not treat implementation green as investment validity.

## Branch-drift lesson

Research OS may add a generated dashboard/index commit to main immediately after a merge. When that makes an in-progress branch stale:

1. preserve the intended file blobs;
2. create a fresh branch from latest main;
3. transplant only intended blobs into a new tree/commit;
4. verify `behind_by=0` and exact changed files;
5. run Draft -> Ready/full CI again.

Do not force-update stale branches merely to save time.
