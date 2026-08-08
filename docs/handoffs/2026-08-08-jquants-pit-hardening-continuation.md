# J-Quants / PIT Hardening Continuation — 2026-08-08

Status: `SOFTWARE_GREEN_REAL_LOCAL_GATES_PENDING`

## Scope

This handoff extends the 2026-08-07 PIT/J-Quants chain through PR #157. It records what is now enforced, what remains local-only, and where to resume without rebuilding the same governance again.

The product priority is unchanged: finish one real local Sanrio Foundation pilot before broad Edge expansion. These PRs harden the price/evidence substrate while that real gate is unavailable in GitHub.

## Newly merged chain

```text
#152 safe metadata-only local J-Quants Price Store audit
#154 deterministic explicit ISO instant validation in local CLI
#155 explicit ISO instant validation in direct J-Quants provider paths
#156 explicit ISO instant validation in Recommendation / Quantitative Outcome price contexts
#157 Research OS schema date-time rollover rejection
```

PR #153 was superseded by #154 after main advanced. It must not be merged.

## PR #152 — local Price Store audit

Canonical runner:

```bash
bash scripts/run-jquants-free-price-store-audit-local.sh
```

Properties:

- read-only
- no network
- missing local store is nonfatal
- metadata-only report
- raw OHLCV not printed
- raw JSONL lines not printed
- contentHash not printed
- absolute local paths not printed
- hard-link / symlink / nested-directory / oversized / invalid JSONL fail closed
- bounded file count and file size
- canonical Price Store + hardening validators reused

Runbook:

`docs/operations/jquants-free-local-price-store-audit.md`

## PR #154 — deterministic CLI instant parser

`--first-executable-at` no longer relies on JavaScript `Date.parse` semantics.

Accepted form:

```text
YYYY-MM-DDTHH:mm:ss[.fraction](Z|±HH:mm)
```

Boundary:

- timezone required
- real Gregorian date required
- hour 00-23
- minute/second 00-59
- UTC offset within ±14:00
- fractional seconds up to 9 digits; deterministic millisecond truncation
- epoch computed explicitly rather than by permissive runtime parsing

Existing retrieval reality remains:

```text
retrievalStartedAt != retrievedAt
retrievedAt is sampled after fetch completion
firstExecutableAt >= actual retrievedAt
```

## PR #155 — direct provider path

Strict instant validation is not only a CLI rule.

Generic parser authority:

`src/research/iso-instant.ts`

The J-Quants provider now rejects implicit timezone timestamps in:

- direct `mapJQuantsFreeQuote(...)`
- provider `retrievedAt`
- conservative `observedAt`
- resolver-produced `firstExecutableAt`

A caller cannot bypass the CLI and regain permissive timestamp semantics.

## PR #156 — upper price contexts

Recommendation / Quantitative Outcome receive `priceRecordsByHash` context that may be assembled in memory rather than loaded through the Price Store schema.

`src/research/price-record-timeline.ts` now uses the same explicit instant parser for:

```text
dataAsOf
observedAt
retrievedAt
firstExecutableAt
```

A re-hashed record with a timezone-less timestamp is rejected by the timeline contract even when its `contentHash` is internally correct.

Independent regressions cover:

- Recommendation issuer pin
- Quantitative Outcome baseline
- Quantitative Outcome measurement row

## PR #157 — Research OS schema date-time correctness

The repository's zero-dependency JSON Schema subset previously checked `format: date-time` with a lexical pattern plus JavaScript `Date` parsing. JavaScript can normalize impossible values such as a non-leap February 29 or 24:00 into another instant.

The schema validator now checks components explicitly.

Rejected examples:

```text
2026-02-29T12:00:00Z
2026-02-31T12:00:00Z
2026-08-04T24:00:00Z
2026-08-04T15:60:00Z
2026-08-04T15:30:60Z
2026-08-04T15:30:00+14:01
2026-08-04T15:30:00+15:00
```

Preserved compatibility:

```text
2026-08-04T15:30+09:00
2026-08-04T15:30:00.123456789+09:00
2026-08-04T15:30:00+14:00
```

This applies to all Research OS schemas using `format: date-time`, including canonical Price Store timestamps and corporate-action observation timestamps.

## Current PIT boundary

At the price layer:

```text
dataAsOf <= observedAt <= retrievedAt <= firstExecutableAt
```

The timestamp must also be a real, explicit-timezone instant. Correct ordering of invalid timestamps is not sufficient.

Layered defense is intentional:

1. provider mapping
2. canonical Price Store schema / validators
3. upper-layer timeline validation
4. Recommendation pins
5. Quantitative Outcome baseline / measurement

Do not remove a layer simply because another layer currently catches the same defect.

## Local resume sequence

### Sanrio — first priority

From repo root:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

Run only the printed `nextCommand`, then rerun the same preflight. Never guess timestamped filenames. Stop progression at:

```text
parity_complete_foundation_gate_pending
```

Do not append Foundation or promote facts automatically.

### J-Quants — safe audit first

```bash
bash scripts/run-jquants-free-price-store-audit-local.sh
```

Then dry-run provider capabilities:

```bash
bash scripts/run-jquants-free-price-provider-local.sh
```

Real network fetch remains an explicit local action only. Re-audit after any local append.

## Remaining real unknowns

Do not infer these from fixtures:

- exact intraday availability of 12-week-delayed Free rows
- rolling two-year boundary behavior
- real missing / no_trade / suspension row shapes
- unusual real security-code cases
- future entitlement changes
- real TOPIX / sector benchmark source suitable for the Foundation pilot
- real Corporate Action Evidence for measured horizons

J-Quants Free is still not the benchmark solution for the real pilot.

## What not to build next merely to keep moving

Do not add another price architecture, another learning governance layer, another active Edge, or synthetic Foundation completion just because the local real-data gate is unavailable.

GitHub-safe work after this handoff should be limited to:

- concrete reproducible defects
- read-only operability
- regression coverage for measured defects
- documentation synchronization

## Branch drift rule

Research OS may write a generated dashboard commit to main immediately after a merge.

If an in-progress branch becomes stale:

1. do not force-push/rewrite merely for convenience
2. start from latest main
3. transplant only intended files/blobs
4. verify exact diff and `behind_by=0`
5. rerun Draft then Ready/full checks

This rule was used repeatedly in #154 and #156 and should remain the default.

## Safety statement

The #152-#157 chain did not change:

- real price or EDINET data
- credentials or Secrets
- billing
- Cloudflare/D1 Production
- LINE delivery behavior
- BUY notifications
- brokerage orders
- active Edge count
- Production Gate
- GitHub runner class or workflow policy

Software integrity has improved. Real Evidence quality and investment validity remain unproven until the local governed pilot is completed.
