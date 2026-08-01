# Filing Deadline Extension Escalation Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-02 JST

## Research question

Do Japanese listed companies that extend statutory filing deadlines exhibit a repeatable, stage-dependent abnormal-return pattern as the extended deadline approaches, is met, or is missed?

The candidate edge is not simply "late filing is bad." It separates a rule-driven escalation ladder:

1. company decision to apply for an extension,
2. regulator approval or denial,
3. extended deadline becomes calendarable,
4. filing before the extended deadline,
5. filing on the deadline,
6. second extension or explicit inability to file,
7. supervision designation / delisting-risk escalation,
8. actual filing and uncertainty resolution,
9. qualified, adverse, or disclaimer audit opinion accompanying the filing.

This is adjacent to Audit Opinion Recovery Ladder and Exchange Sanction Ladder, but distinct. The key state variable is remaining time to a legally and exchange-defined filing cliff.

## Primary-source grounding

JPX publishes a current list of companies whose annual or semiannual securities-report deadlines have been extended. As of the research checkpoint, current domestic examples include Omikenshi (3111), Abalance (3856), BlueMeme (4069), Air Water (4088), Cota (4923), Nidec (6594), Iriso Electronics (6908), Advance Create (8798), and Asahi Group Holdings (2502).

JPX disclosure rules require immediate disclosure when a company decides to apply for an extension and again when approval or denial occurs. JPX delisting rules provide a defined escalation after the extended deadline: failure to submit within the specified grace period can lead to delisting. A company that states it cannot file by the legal deadline can also be designated as a security under supervision pending confirmation.

These rule-based dates create a PIT-reproducible event calendar suitable for event-study testing.

## Candidate mechanism

### H1: Approval relief versus unresolved-accounting discount

Regulatory approval of an extension may produce short-term relief because an immediate technical default is avoided. However, the stock may remain discounted if the underlying audit or accounting issue is unresolved.

### H2: Deadline-proximity convexity

Negative price sensitivity may increase nonlinearly as the extended deadline approaches without a credible filing timetable. The final 10, 5, and 1 trading days may carry different hazard rates.

### H3: On-time filing uncertainty relief

Filing before the extended deadline may create positive abnormal return when no materially worse facts or severe audit opinion are included.

### H4: Filing package dominates filing fact

The act of filing alone is not sufficient. Returns should be conditioned on:

- audit opinion,
- size and direction of restatement,
- going-concern wording,
- internal-control report,
- covenant or financing effects,
- management changes,
- next reporting deadline.

### H5: Explicit inability-to-file cliff

An announcement that filing will not occur by the applicable deadline is a materially different state from a routine extension approval and may trigger supervision designation and sharply higher delisting probability.

## Dataset contract

For each issuer and report:

- issuer, code, market segment, fiscal period,
- original deadline and extended deadline,
- application-decision timestamp,
- approval or denial timestamp,
- stated extension reason,
- expected filing date stated by management,
- actual filing timestamp,
- days early or late versus extended deadline,
- whether a second extension was requested,
- whether inability to file was explicitly announced,
- supervision / special-attention / delisting state before and after,
- audit opinion and key basis paragraphs,
- restatement magnitude by revenue, operating profit, net income, equity and cash,
- internal-control weakness classification,
- going-concern and financing consequences,
- management or auditor changes,
- D0, D+1, D+3, D+5, D+20 returns,
- market and sector abnormal returns,
- volume shock, gap, spread proxy, borrow availability and short cost,
- concurrent earnings, guidance, capital actions, index changes, block trades and macro confounders.

## PIT-safe event windows

Test separately:

- application decision: next executable open after disclosure,
- approval / denial: next executable open,
- T-20 to T-1 deadline drift,
- filing timestamp to next executable open,
- explicit inability-to-file disclosure to next executable open,
- supervision designation to next executable open,
- audit-opinion publication to next executable open.

Do not use the original close when the disclosure occurred after market close. Do not infer the actual filing package before EDINET publication.

## Initial seed cohort

### Current extension cohort

- Omikenshi (3111): FY2026 annual report, extended from 2026-06-30 to 2026-09-30.
- Abalance (3856): FY2026 annual report, extended from 2026-06-30 to 2026-08-31.
- BlueMeme (4069): FY2026 annual report, extended from 2026-06-30 to 2026-09-30.
- Air Water (4088): FY2026 annual report, extended from 2026-06-30 to 2026-07-31.
- Cota (4923): FY2026 annual report, extended from 2026-06-30 to 2026-09-30.
- Nidec (6594): FY2026 annual report, extended from 2026-06-30 to 2026-09-30.
- Iriso Electronics (6908): FY2026 annual report, extended from 2026-06-30 to 2026-09-30.
- Advance Create (8798): FY2026 semiannual report, extended from 2026-05-15 to 2026-08-14.
- Asahi Group Holdings (2502): FY2025 annual report, extended from 2026-03-31 to 2026-07-27.

### Escalation analog

- V-cube (3681): JPX designated the shares as a security under supervision after the company disclosed that it did not expect to file its FY2025 annual securities report by the applicable deadline. This case is a useful positive-control example of explicit filing-cliff escalation, but must be separated from its concurrent listing-maintenance issue.

## Confounders and controls

Mandatory controls:

- underlying misconduct or cyber incident severity,
- audit-firm resignation or replacement,
- concurrent earnings and guidance,
- restatement size,
- liquidity and small-cap distress,
- going-concern wording,
- financing or covenant pressure,
- existing supervision or special-attention designation,
- market-maintenance noncompliance,
- holiday and month-end effects,
- disclosure timestamp and next executable session.

Counterfactual twins should match on market segment, size, liquidity, industry, leverage, prior drawdown, and reason for delay.

## Falsification

Reject or downgrade if:

- deadline proximity adds no explanatory power beyond generic distress momentum,
- approval-day reactions reverse before realistic execution,
- filing-day returns are fully explained by the audit opinion or restatement package,
- only microcap distressed issuers drive the effect,
- borrow cost and gap risk eliminate short-side alpha,
- the effect disappears in untouched holdout years,
- event timestamps cannot be reconstructed point in time.

## Entry / exit candidates

Research only:

- approval-relief long: next open after approval, exit D+1 or D+3,
- deadline-drift short: only after a pre-registered no-progress condition and confirmed borrow, exit before the deadline or on a filing update,
- filing-relief long: next open after filing when the package contains no new hard blocker,
- escalation short: next open after explicit inability-to-file or supervision designation, subject to borrow and gap-risk constraints.

No production signal may rely on buying or shorting at a price unavailable after the public disclosure.

## Promotion gate

Do not promote unless:

- independent issuer-events span multiple years and market segments,
- each ladder stage is tested separately,
- abnormal return survives sector, size, liquidity and distress controls,
- net alpha remains positive after spread, slippage and borrow costs,
- no single issuer or accounting scandal dominates PnL,
- untouched holdout passes,
- event timestamps and filing packages are PIT reproducible,
- the edge adds information beyond Audit Opinion Recovery Ladder, Exchange Sanction Ladder and generic momentum.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

The useful advance is a calendarable hazard framework: extension approval is not the terminal event. The state evolves as remaining time shrinks, filing credibility changes, and the final filing package reveals audit and accounting severity. The next task is to backfill historical JPX extension cohorts, construct deadline-distance features, and test whether T-20/T-10/T-5/T-1 returns contain incremental signal after distress controls.

## Source policy audit

Used: JPX extension-company list, JPX disclosure obligations, JPX delisting rules, JPX supervision-designation notices, FSA/EDINET filing framework.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.