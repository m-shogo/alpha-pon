# Pre-Edge Foundation Integration Status — 2026-08-06

Status: `CURRENT_INTEGRATION_HANDOFF`
Updated: 2026-08-06 JST
Canonical roadmap: `docs/roadmaps/alpha-pon-current-roadmap-2026-08-06.md`
Canonical runner policy: `docs/operations/github-actions-cost-control.md`

## Authority

This file records the current integration state for PR #38. The 2026-08-05 roadmap, review and slice documents remain useful design-history records, but their old PR, billing and runner status statements are not current authority.

GitHub exact SHAs, actual workflow steps, the 2026-08-06 canonical roadmap and the active runner policy take precedence.

## Current measured state

- Repository visibility is public.
- Standard `ubuntu-latest` runners execute real checkout, setup, install and command steps.
- The former startup failure with `steps: []` / `steps: null` is resolved for current runs.
- PR #50 runner-cost controls and PR #51 regression guards are merged.
- PR #37 PIT Price Store v1 was synchronized to the latest main, passed Draft and Ready real-runner validation, and merged as `3854ffd10303d505fc68b9461c30b16cf5fb7727`.
- PR #38 is the current documentation integration slice.
- No billing or spending-limit change was made to obtain the current result.
- Cloudflare production deployment is separate from GitHub CI. CI only builds Static Assets and executes Wrangler dry-run validation.

## PR #37 validation evidence

Exact validated head before merge:

```text
4e2021aa946e602c149fa31ae719e4b2cc236a11
```

Draft runs:

```text
Check       31068947368  success
Research OS 31068947333  success
CI          31068947335  skipped by Draft policy
```

Ready/full runs:

```text
Check       31069023541  success
Research OS 31069023557  success
CI          31069023552  success
```

The Ready runs contained real checkout, dependency installation and command steps. Research OS completed typecheck, unit tests, schema/PIT validation, history/docs guards, fixture backtest and generated-file verification. CI completed D1/calendar contracts, Static Assets build and Wrangler dry-run without deploying production.

## Current merge sequence

```text
#38 Foundation documentation
-> #39 Stock Pro Council contract
-> #40 dissent/veto ledgers
-> #41 deterministic replay
-> #42 calibration/confidence gates
-> #44 Security Master
-> #45 Bitemporal Evidence Store
-> #46 Claim / Contradiction Graph
-> #47 Document Revision / Diff
-> #48 Evidence Package Manifest
-> #49 Testable Hypothesis / Scenario Set
-> new cross-stack Decision integration PR
```

PR #43 remains a reusable council-side implementation source. It must not be merged as the final cross-stack Decision Firewall.

## Historical document interpretation

The following files remain design references:

- `docs/roadmaps/pre-edge-foundation-roadmap-2026-08-05.md`
- `docs/research/pre-edge-foundation-hardening-review.md`
- `docs/handoffs/2026-08-05-foundation-pr-slices.md`
- `docs/handoffs/2026-08-05-pre-edge-foundation-stock-pro-council.md`

Statements in those files such as PR #37 being Draft, CI being blocked, or implementation not having started describe the 2026-08-05 snapshot. They do not override this current handoff or the canonical 2026-08-06 roadmap.

## Safety boundary

This integration does not authorize:

- force-push or destructive history repair;
- paid runner, billing or token changes;
- real price or licensed Evidence commits;
- production LINE delivery;
- BUY notification or brokerage order;
- Cloudflare deployment or D1 write;
- active Edge or Production Gate promotion.

## PR #38 completion conditions

- branch contains the exact PR #37 merge on main;
- current-status handoff and canonical links are present;
- old billing/runner blocker language is explicitly historical, not current;
- Draft lightweight Check and Research OS execute real steps and pass;
- Ready full validation executes once and passes;
- no generated-file hand edit, secret, real data or production mutation occurs.
