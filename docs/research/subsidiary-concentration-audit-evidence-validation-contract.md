# Subsidiary Concentration × Audit-Evidence Validation Contract

Status: `SHADOW_RESEARCH`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-02 JST

## Purpose

Turn the current one-case research seed into a falsifiable interaction test. The edge must prove that **economic concentration adds incremental information** beyond generic audit-opinion severity, distress, liquidity, and exchange sanctions.

This contract applies to `subsidiary-concentration-audit-evidence-escalation-edge.md` and `data/research/subsidiary-concentration-audit-evidence-seed-2026-08-02.json`.

## Unit of analysis

One row is one issuer-event pair at the first official, executable disclosure that establishes an audit-evidence limitation involving a subsidiary.

Do not create multiple positive rows from later restatements, exchange measures, or remediation reports for the same underlying information shock. Later stages belong in a linked event ladder and are used only for path analysis.

## Point-in-time eligibility

A case is eligible only when all of the following were public by `decisionCheckpoint`:

1. identity of the affected subsidiary or controlled entity,
2. a specific audit-evidence failure state,
3. at least one reproducible subsidiary concentration measure,
4. official disclosure timestamp precise enough to define an executable next-open entry.

Allowed concentration evidence:

- subsidiary or segment revenue disclosed in a filing,
- operating profit, EBITDA, cash-flow, asset, customer, or financing contribution disclosed in a filing,
- an official exchange or regulator statement giving a quantitative share.

Forbidden substitutions:

- headline prominence,
- legal ownership percentage alone,
- management descriptions such as “important subsidiary” without a quantitative denominator,
- post-event figures unavailable at the decision checkpoint.

## Interaction labels

### Audit-evidence state

- `NONE`: no evidence limitation.
- `DELAYED`: evidence expected but not available by the reporting deadline.
- `INCOMPLETE`: materials or explanations insufficient.
- `CONTRADICTORY`: evidence conflicts with management explanations or other records.
- `REFUSED_OR_UNAVAILABLE`: management or subsidiary cannot or will not provide required evidence.
- `SCOPE_BLOCKING`: limitation prevents an audit opinion or review conclusion.

### Economic concentration state

Compute from point-in-time fields without choosing the most favorable metric after seeing returns.

- `LOW`: all available core measures below 20%.
- `MEDIUM`: at least one core measure from 20% to below 50%.
- `HIGH`: revenue, operating cash flow, or operating profit at or above 50%.
- `DOMINANT`: revenue or operating cash flow at or above 80%.
- `UNKNOWN`: no valid denominator; not eligible as a positive case.

### Positive interaction

A positive interaction requires:

- audit-evidence state at least `INCOMPLETE`, and
- concentration state `HIGH` or `DOMINANT`, and
- official parent-oversight weakness or a documented inability of the parent to reconstruct the subsidiary records.

The REVOLUTION seed is a positive discovery case, never a holdout or outcome-independent validation case.

## Required comparison cohorts

The test is invalid without all four cohorts:

1. **High concentration + audit-evidence failure** — candidate interaction.
2. **Low concentration + audit-evidence failure** — tests concentration increment.
3. **High concentration + ordinary misconduct but no audit-evidence failure** — tests evidence-failure increment.
4. **Matched distressed issuers without subsidiary evidence failure** — controls generic distress, liquidity, dilution, and exchange-sanction beta.

Matching dimensions:

- market segment,
- market capitalization and free float,
- trailing volatility,
- prior 20-session drawdown,
- spread and turnover,
- financing need and going-concern state,
- concurrent earnings or capital actions,
- exchange-measure state.

## Outcome windows

Primary outcome must be frozen before labels are expanded:

- primary: next executable open to D+5 close abnormal return,
- diagnostics: D0 close, D+1, D+3, D+20,
- secondary risk: maximum adverse excursion through D+20,
- resolution study: clean audit conclusion or verified evidence restoration to D+5.

Benchmark hierarchy:

1. TOPIX-relative,
2. sector-relative,
3. matched-control-relative.

Do not combine windows to manufacture significance.

## Incremental-information test

The interaction is not supported unless it improves prediction beyond a baseline containing:

- audit opinion / review conclusion severity,
- filing delay,
- special-attention or improvement-report status,
- going-concern and financing pressure,
- market capitalization, liquidity, volatility, prior drawdown,
- concurrent guidance, dilution, M&A, asset sale, or index event.

Minimum comparisons:

- baseline model,
- baseline + audit-evidence state,
- baseline + concentration state,
- baseline + both main effects,
- baseline + both main effects + interaction term.

Promotion requires the interaction term to add economically meaningful out-of-sample information, not only in-sample statistical significance.

## Execution and net-alpha guard

For each case store:

- official publication timestamp and source URL,
- first realistically tradable session,
- opening gap already consumed before entry,
- spread and turnover proxy,
- borrow availability, fee, restrictions, and price-limit state,
- slippage assumption,
- next-open to exit return after costs.

If most loss occurs before an executable entry, classify the finding as an event-study result, not a trading edge.

## Leakage and duplication guards

Fail closed when:

- concentration data were published after the event,
- the row uses a later exchange action as if known at the first disclosure,
- multiple rows represent the same underlying shock,
- a parent and subsidiary listing are both counted without portfolio clustering,
- outcome returns influenced case selection,
- an event timestamp cannot distinguish pre-close from after-close publication.

## Holdout design

- Discovery set may contain REVOLUTION and current named candidates.
- Development set must contain independent historical issuers across at least three sectors.
- Untouched holdout must be frozen before thresholds or feature weights are finalized.
- Related issuers, repeated scandals, and stages of the same case must remain in the same split.

## Falsification outcomes

Downgrade or reject the edge when any of the following occurs:

- high-concentration cases do not underperform low-concentration audit-evidence cases after controls,
- the interaction adds no value beyond disclaimer / filing-delay severity,
- realistic next-open entry removes the apparent effect,
- borrow, spread, and gap costs consume net alpha,
- results are driven by one microcap or one sector,
- concentration thresholds are unstable across reasonable definitions,
- untouched holdout fails.

## Minimum promotion gate

Remain `SHADOW_RESEARCH` until all are met:

- at least 20 independent eligible issuer-events,
- at least 5 cases in each of the four comparison cohorts,
- no issuer contributes more than 15% of gross research PnL,
- positive net alpha after executable-entry and cost assumptions,
- interaction adds information beyond baseline controls,
- untouched holdout passes,
- source timestamps and concentration fields are point-in-time reproducible.

Meeting these conditions permits review only; it does not automatically authorize production use.

## Source policy audit

Allowed: company IR, TDnet, EDINET, JPX, regulator and court records, reliable major reporting for confirmation, and market data.

Not allowed: SNS, forums, influencer posts, anonymous claims, or social sentiment.