# Handoff — PIT Price Store v1 Review Fixes

Status: `IMPLEMENTED_AWAITING_REPOSITORY_VALIDATION`
Updated: 2026-08-05 JST
PR: #37

## Purpose

Close the remaining PIT and series-identity gaps found during the Pre-Edge Foundation review. These fixes protect Backtest, Deterministic Replay, Event Study and Recommendation from price-basis mixing, execution-before-retrieval, ambiguous provider state, license misuse and future corporate-action leakage.

This handoff does not authorize real API access, licensed price commits, live LINE delivery, Cloudflare/D1 changes, billing changes or brokerage orders.

## Implementation

Canonical governed API:

- `src/research/price-store-hardening.ts`
- `tests/research/price-store-hardening.test.ts`
- `src/research/cli/validate-prices.ts` now uses the hardening validator
- `tests/research/pit.test.ts` imports the hardening suite, so `pnpm research:test` covers it

The original `price-store.ts` remains the low-level storage contract. Event Study, Recommendation and deterministic replay must use the hardening API rather than selecting raw records directly.

## Implemented fixes

### 1. Explicit price basis in governed series identity — IMPLEMENTED

`HardenedPriceSeriesSelector` requires:

```text
priceBasis: adjusted | unadjusted
```

The governed validator validates adjusted and unadjusted records as separate revision groups. Selection identity also includes basis, and runtime use without an explicit valid basis throws.

### 2. Execution cannot precede retrieval — IMPLEMENTED

Enforced invariant:

```text
firstExecutableAt >= retrievedAt >= observedAt
```

The original validator already enforces `retrievedAt >= observedAt` and `firstExecutableAt >= observedAt`. The hardening validator adds a dedicated `execution_before_retrieval` error.

### 3. Explicit cutoff mode — IMPLEMENTED

```text
provider_available
  observedAt <= cutoff
```

This mode is only for studying when information theoretically existed at the provider. It does not mean Alpha Pon retrieved it and does not authorize a paper trade.

```text
system_replay
  observedAt <= cutoff
  retrievedAt <= cutoff
  firstExecutableAt <= cutoff
```

`system_replay` is the default and is required for Recommendation and deterministic replay.

The executable APIs enforce this boundary:

- `toHardenedBacktestPriceSeries` rejects `provider_available`;
- `validateEventStudyPriceAlignment` rejects `provider_available`;
- Event Study and Net Alpha are `system_replay` only.

A theoretical provider study must not be reported as executable Alpha. A future provider-theoretical execution timestamp must be derived separately from the versioned Market Calendar rather than reusing Alpha Pon's actual `firstExecutableAt`.

### 4. Reject unknown governed provider state — IMPLEMENTED

The hardening validator blocks:

- `providerPlan=unknown`
- blank or unresolved source identifiers

The governed writer rejects these rows before append.

### 5. License scope boundary — IMPLEMENTED

- `license=unknown` remains rejected by the base store;
- `license=metadata_only` cannot carry a traded OHLCV payload;
- real price rows require an applicable `local_only` or `redistributable` contract;
- storage rights do not imply redistribution rights.

### 6. Provider batch coherence — IMPLEMENTED FOR V1

`validateProviderBatchAgainstQuery` checks:

- capabilities/plan/license/source-version/retrievedAt consistency through the base batch validator;
- query plan;
- requested series kind;
- requested codes;
- requested date range;
- `dataAsOf` and `observedAt` cutoff;
- one unambiguous record source per batch;
- one deterministic `ingestionRunId` per batch;
- optional exact `expectedSource` and `expectedIngestionRunId` supplied by the adapter.

The J-Quants adapter must pass its exact expected source and run ID. A future batch manifest/content hash may be added with the adapter without weakening this contract.

### 7. Status and missing reason matrix — IMPLEMENTED

Allowed combinations:

```text
traded
  OHLCV required
  no missingReason

suspended
  exchange_suspension

no_trade
  no_execution | market_holiday

missing
  provider_gap | outside_entitlement | not_yet_available
```

`market_holiday` still requires the Market Calendar layer before Recommendation use. `unknown` is not an accepted governed reason.

### 8. Corporate-action effective-time safety — IMPLEMENTED FOR V1

The existing record carries:

- action `observedAt`;
- `effectiveDate`;
- factor;
- source.

The hardening validator rejects a future-effective corporate action inside an earlier adjusted row. For v1, `effectiveDate` is the factor applicability boundary.

A richer announcement/event/revision graph belongs in the Bitemporal Evidence Store and Capitalization Ledger; it must extend rather than weaken this rule.

### 9. Append concurrency and partial-write recovery — IMPLEMENTED

`appendPriceRecordsWithLock` adds:

- atomic lock-directory acquisition;
- owner token metadata;
- no automatic stale-lock takeover;
- strict final-newline check;
- strict JSONL parse before append;
- explicit block on malformed/partial tails;
- validation of existing and incoming rows through the hardening contract;
- append and `fsync` only after all errors are cleared;
- cleanup after a completed or failed owned write.

All governed writers must use this wrapper. Non-cooperating direct writers are forbidden by contract.

### 10. Downstream benchmark completeness — IMPLEMENTED

`validateEventStudyPriceAlignment` requires:

- issuer series;
- benchmark/TOPIX series;
- sector series;
- `system_replay` cutoff mode;
- same declared price basis;
- matching traded-date sets;
- no ambiguous source/plan selection.

No silent fallback is permitted.

## Acceptance tests added

1. adjusted and unadjusted records coexist without revision collision;
2. selector omission of price basis throws;
3. first executable before retrieval is rejected;
4. system replay excludes a record retrieved after cutoff;
5. provider-available mode can be selected only for availability research;
6. Backtest rejects provider-available mode;
7. Event Study / Net Alpha rejects provider-available mode;
8. unknown provider plan/source is rejected;
9. metadata-only OHLCV payload is rejected;
10. batch code/range/source/run identity is checked;
11. invalid status/reason combinations are rejected;
12. future-effective split cannot leak into an earlier adjusted row;
13. existing lock blocks a second writer;
14. partial JSONL tail blocks append;
15. unsafe rows are rejected inside the locked writer;
16. Event Study without issuer/TOPIX/sector completeness is blocked.

## Validation status

A standalone TypeScript prototype harness matching the repository interfaces was typechecked and executed successfully before push. This is not a substitute for validation in the complete repository.

Required exact-HEAD repository validation remains:

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
pnpm exec tsc --noEmit -p tsconfig.scripts.json
pnpm research:validate
pnpm research:generate:check
pnpm research:check:history
pnpm research:check:docs
pnpm research:backtest:fixtures
pnpm research:test
pnpm exec tsx tests/research/price-store.test.ts
pnpm exec tsx tests/research/price-store-hardening.test.ts
pnpm exec tsx src/research/cli/validate-prices.ts --root=research/fixtures/prices
```

Then require CI / Check / Research OS to execute actual steps and pass on the exact latest HEAD.

## Ready rule

Do not mark PR #37 Ready or merge until:

- complete-repository typecheck and tests pass;
- exact latest HEAD receives actual runner steps;
- CI / Check / Research OS are green;
- final review confirms all governed callers use the hardened path;
- no real price, secret, live LINE, Cloudflare/D1, billing or order action occurred.
